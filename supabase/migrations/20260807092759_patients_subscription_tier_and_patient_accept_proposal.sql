-- =============================================================================
-- Premium vs Generic care mode + patient-accept program review proposals
-- =============================================================================
-- subscription_tier: premium (therapist-led, default for all existing rows) |
--                    generic (AI-led proposals; patient must accept before apply).
-- patient_accept / patient_decline RPCs mirror therapist approve/decline but
-- require subscription_tier = 'generic' and auth_user_id = caller.
-- Accept MUST write clinical_audit_logs so therapists see AI→patient footprint.
-- =============================================================================

-- ── 1. patients.subscription_tier ────────────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'premium';

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_subscription_tier_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_subscription_tier_check
  CHECK (subscription_tier IN ('premium', 'generic'));

COMMENT ON COLUMN public.patients.subscription_tier IS
  'Care mode: premium = therapist-led (AI assistant for therapist only); generic = AI-led proposals with patient-accept apply. Existing rows default to premium.';

-- Backfill from payload if already set; otherwise keep DEFAULT premium.
UPDATE public.patients p
SET subscription_tier = CASE
  WHEN lower(coalesce(p.payload ->> 'subscriptionTier', p.payload ->> 'subscription_tier', '')) = 'generic'
    THEN 'generic'
  ELSE 'premium'
END
WHERE p.subscription_tier IS DISTINCT FROM CASE
  WHEN lower(coalesce(p.payload ->> 'subscriptionTier', p.payload ->> 'subscription_tier', '')) = 'generic'
    THEN 'generic'
  ELSE 'premium'
END;

CREATE INDEX IF NOT EXISTS idx_patients_subscription_tier_generic
  ON public.patients (subscription_tier)
  WHERE subscription_tier = 'generic';

-- Sync column ↔ payload.subscriptionTier (same pattern as allow_chat).
CREATE OR REPLACE FUNCTION public.tg_patients_sync_subscription_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  raw text;
BEGIN
  IF NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'object' THEN
    NEW.subscription_tier := COALESCE(NEW.subscription_tier, 'premium');
    RETURN NEW;
  END IF;

  IF NEW.payload ? 'subscriptionTier' OR NEW.payload ? 'subscription_tier' THEN
    raw := lower(btrim(coalesce(
      NEW.payload ->> 'subscriptionTier',
      NEW.payload ->> 'subscription_tier',
      ''
    )));
    IF raw = 'generic' THEN
      NEW.subscription_tier := 'generic';
    ELSE
      NEW.subscription_tier := 'premium';
    END IF;
  ELSE
    NEW.subscription_tier := COALESCE(NEW.subscription_tier, 'premium');
  END IF;

  -- Keep payload camelCase in sync with column for app reads.
  NEW.payload := jsonb_set(
    NEW.payload,
    '{subscriptionTier}',
    to_jsonb(NEW.subscription_tier),
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_sync_subscription_tier ON public.patients;
CREATE TRIGGER trg_patients_sync_subscription_tier
  BEFORE INSERT OR UPDATE OF payload, subscription_tier
  ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_patients_sync_subscription_tier();

COMMENT ON FUNCTION public.tg_patients_sync_subscription_tier() IS
  'Keeps patients.subscription_tier aligned with payload.subscriptionTier.';

REVOKE ALL ON FUNCTION public.tg_patients_sync_subscription_tier() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_patients_sync_subscription_tier() FROM anon, authenticated;

-- Portal self-update: patients must not flip subscription_tier.
CREATE OR REPLACE FUNCTION public.tg_patients_lock_patient_controlled_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  is_patient_self boolean;
BEGIN
  is_patient_self := (
    caller IS NOT NULL
    AND OLD.auth_user_id IS NOT NULL
    AND OLD.auth_user_id = caller
  );

  IF NOT is_patient_self THEN
    RETURN NEW;
  END IF;

  NEW.therapist_id := OLD.therapist_id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.account_frozen := OLD.account_frozen;
  NEW.status := OLD.status;
  NEW.allow_chat := OLD.allow_chat;
  NEW.subscription_tier := OLD.subscription_tier;

  IF NEW.payload IS NOT NULL AND jsonb_typeof(NEW.payload) = 'object'
     AND OLD.payload IS NOT NULL AND jsonb_typeof(OLD.payload) = 'object'
  THEN
    NEW.payload := (
      NEW.payload
      - 'accountFrozen' - 'account_frozen' - 'status'
      - 'allowChat' - 'allow_chat'
      - 'subscriptionTier' - 'subscription_tier'
    );

    IF OLD.payload ? 'accountFrozen' THEN
      NEW.payload := jsonb_set(NEW.payload, '{accountFrozen}', OLD.payload -> 'accountFrozen', true);
    END IF;
    IF OLD.payload ? 'account_frozen' THEN
      NEW.payload := jsonb_set(NEW.payload, '{account_frozen}', OLD.payload -> 'account_frozen', true);
    END IF;
    IF OLD.payload ? 'status' THEN
      NEW.payload := jsonb_set(NEW.payload, '{status}', OLD.payload -> 'status', true);
    END IF;
    IF OLD.payload ? 'allowChat' THEN
      NEW.payload := jsonb_set(NEW.payload, '{allowChat}', OLD.payload -> 'allowChat', true);
    END IF;
    IF OLD.payload ? 'allow_chat' THEN
      NEW.payload := jsonb_set(NEW.payload, '{allow_chat}', OLD.payload -> 'allow_chat', true);
    END IF;
    IF OLD.payload ? 'subscriptionTier' THEN
      NEW.payload := jsonb_set(NEW.payload, '{subscriptionTier}', OLD.payload -> 'subscriptionTier', true);
    END IF;
    IF OLD.payload ? 'subscription_tier' THEN
      NEW.payload := jsonb_set(NEW.payload, '{subscription_tier}', OLD.payload -> 'subscription_tier', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_patients_lock_patient_controlled_columns() IS
  'Portal self-update: restores therapist_id, auth_user_id, account_frozen, status, allow_chat, subscription_tier (columns + payload keys).';

-- ── 2. Patient-accept RPC (Generic only) + clinical_audit_logs footprint ──────

CREATE OR REPLACE FUNCTION public.patient_accept_program_review_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.program_review_proposals%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_prev_id uuid;
  v_prev_version integer;
  v_new_id uuid;
  v_accepted_at timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT * INTO v_row
  FROM public.program_review_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = v_row.patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_mismatch');
  END IF;

  IF v_patient.auth_user_id IS NULL OR v_patient.auth_user_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_patient.subscription_tier IS DISTINCT FROM 'generic' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tier_not_generic');
  END IF;

  IF v_patient.account_frozen = true OR v_patient.status IN ('frozen', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_locked');
  END IF;

  IF jsonb_typeof(v_row.proposed_exercises) <> 'array'
     OR jsonb_array_length(v_row.proposed_exercises) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_plan');
  END IF;

  SELECT id, version_number INTO v_prev_id, v_prev_version
  FROM public.exercise_plans
  WHERE patient_id = v_row.patient_id AND is_active = true
  FOR UPDATE;

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.exercise_plans
    SET is_active = false, updated_at = now()
    WHERE id = v_prev_id;
  END IF;

  INSERT INTO public.exercise_plans (
    patient_id, exercises, version_number, is_active, parent_plan_id, change_summary, updated_at
  )
  VALUES (
    v_row.patient_id,
    v_row.proposed_exercises,
    COALESCE(v_prev_version, 0) + 1,
    true,
    v_prev_id,
    left(format('אישור מטופל (Generic) לביקורת AI (%s): %s', v_row.decision, coalesce(v_row.rationale, '')), 240),
    now()
  )
  RETURNING id INTO v_new_id;

  -- Therapist-visible footprint: AI proposed + patient accepted (no PHI).
  -- therapist_id = assigned clinic therapist so RLS SELECT shows the row.
  INSERT INTO public.clinical_audit_logs (
    therapist_id, patient_id, entity_type, action, old_value, new_value
  )
  VALUES (
    v_row.therapist_id,
    v_row.patient_id,
    'recommendation',
    'patient_accept',
    jsonb_build_object(
      'proposalId', v_row.id,
      'decision', v_row.decision,
      'metrics', v_row.metrics,
      'proposedChanges', v_row.proposed_changes,
      'source', 'program_review_ai'
    ),
    jsonb_build_object(
      'proposalId', v_row.id,
      'status', 'approved',
      'planId', v_new_id,
      'acceptedAt', v_accepted_at,
      'acceptedBy', 'patient',
      'subscriptionTier', 'generic',
      'summaryHebrew', format(
        'ה-AI הציע שינוי תוכנית והמטופל אישר אותו בתאריך %s',
        to_char(v_accepted_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI')
      ),
      'summaryEnglish', format(
        'AI proposed a plan change and the patient accepted it on %s',
        to_char(v_accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  );

  -- resolved_by stays null: patient auth uid is not profiles.id; audit carries actor.
  UPDATE public.program_review_proposals
  SET status = 'approved', resolved_at = v_accepted_at, resolved_by = NULL
  WHERE id = v_row.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_race' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'patientId', v_row.patient_id,
    'planId', v_new_id,
    'acceptedAt', v_accepted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_decline_program_review_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.program_review_proposals%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_declined_at timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT * INTO v_row
  FROM public.program_review_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = v_row.patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_mismatch');
  END IF;

  IF v_patient.auth_user_id IS NULL OR v_patient.auth_user_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_patient.subscription_tier IS DISTINCT FROM 'generic' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tier_not_generic');
  END IF;

  INSERT INTO public.clinical_audit_logs (
    therapist_id, patient_id, entity_type, action, old_value, new_value
  )
  VALUES (
    v_row.therapist_id,
    v_row.patient_id,
    'recommendation',
    'patient_decline',
    jsonb_build_object(
      'proposalId', v_row.id,
      'decision', v_row.decision,
      'source', 'program_review_ai'
    ),
    jsonb_build_object(
      'proposalId', v_row.id,
      'status', 'declined',
      'declinedAt', v_declined_at,
      'declinedBy', 'patient',
      'subscriptionTier', 'generic',
      'summaryHebrew', format(
        'ה-AI הציע שינוי תוכנית והמטופל דחה אותו בתאריך %s',
        to_char(v_declined_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI')
      ),
      'summaryEnglish', format(
        'AI proposed a plan change and the patient declined it on %s',
        to_char(v_declined_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  );

  UPDATE public.program_review_proposals
  SET status = 'declined', resolved_at = v_declined_at, resolved_by = NULL
  WHERE id = v_row.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_race' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'patientId', v_row.patient_id, 'declinedAt', v_declined_at);
END;
$$;

COMMENT ON FUNCTION public.patient_accept_program_review_proposal(uuid) IS
  'Generic patient only: accept pending AI program review → versioned plan + clinical_audit_logs patient_accept footprint.';
COMMENT ON FUNCTION public.patient_decline_program_review_proposal(uuid) IS
  'Generic patient only: decline pending AI program review + clinical_audit_logs patient_decline footprint.';

REVOKE ALL ON FUNCTION public.patient_accept_program_review_proposal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_decline_program_review_proposal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.patient_accept_program_review_proposal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.patient_decline_program_review_proposal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.patient_accept_program_review_proposal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.patient_decline_program_review_proposal(uuid) TO authenticated, service_role;
