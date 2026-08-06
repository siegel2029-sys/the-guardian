-- =============================================================================
-- Security audit hardening (2026-08-06) — part 2
-- link_patient, lead triage+rate limit, FORCE RLS, approve/decline RPCs,
-- hard_delete RPCs, revoke anon helper, engine status role gates
-- =============================================================================

-- ── link_patient_auth_user — app_metadata claim only ─────────────────────────

CREATE OR REPLACE FUNCTION public.link_patient_auth_user(p_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_pid text := nullif(btrim(coalesce(p_patient_id, '')), '');
  v_claim text;
  v_am jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_patient_id');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = v_pid
      AND p.auth_user_id IS NOT NULL
      AND p.auth_user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_linked');
  END IF;

  SELECT coalesce(u.raw_app_meta_data, '{}'::jsonb)
  INTO v_am
  FROM auth.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_user_missing');
  END IF;

  v_claim := nullif(btrim(coalesce(v_am ->> 'patient_id', '')), '');

  IF v_claim IS NULL OR v_claim <> v_pid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_mismatch');
  END IF;

  UPDATE public.patients
  SET auth_user_id = v_uid
  WHERE id = v_pid
    AND (auth_user_id IS NULL OR auth_user_id = v_uid);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_match');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.link_patient_auth_user(text) IS
  'Portal link: SECURITY DEFINER. Idempotent when already linked. Claim from auth.users app_metadata.patient_id only. Soft-fails with JSON.';

REVOKE ALL ON FUNCTION public.link_patient_auth_user(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_patient_auth_user(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO service_role;

-- ── save_onboarding_lead — triage + rate limit ───────────────────────────────

CREATE OR REPLACE FUNCTION public.save_onboarding_lead(
  p_lead_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_pain_level integer,
  p_status text,
  p_questionnaire jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text := NULLIF(btrim(COALESCE(p_full_name, '')), '');
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_status text := COALESCE(NULLIF(btrim(COALESCE(p_status, '')), ''), 'abandoned');
  v_questionnaire jsonb := COALESCE(p_questionnaire, '{}'::jsonb);
  v_current_status text;
  v_id uuid;
  v_pain integer := p_pain_level;
  v_has_red_flag boolean;
  v_rate_count integer;
BEGIN
  IF v_full_name IS NOT NULL AND char_length(v_full_name) > 120 THEN
    RAISE EXCEPTION 'invalid_full_name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 32 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (
    char_length(v_email) > 254
    OR v_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  ) THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF p_pain_level IS NOT NULL AND (p_pain_level < 0 OR p_pain_level > 10) THEN
    RAISE EXCEPTION 'invalid_pain_level' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('abandoned', 'pending_paybox', 'pending_zoom') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(v_questionnaire) > 32768 THEN
    RAISE EXCEPTION 'questionnaire_too_large' USING ERRCODE = '22023';
  END IF;

  v_has_red_flag := (
    COALESCE((v_questionnaire -> 'redFlags' ->> 'trauma') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire -> 'redFlags' ->> 'caudaEquina') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire -> 'redFlags' ->> 'systemic') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire -> 'redFlags' ->> 'motorWeakness') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire -> 'redFlags' ->> 'nightPain') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire ->> 'trauma') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire ->> 'caudaEquina') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire ->> 'systemic') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire ->> 'motorWeakness') IN ('true', 't', '1'), false)
    OR COALESCE((v_questionnaire ->> 'nightPain') IN ('true', 't', '1'), false)
  );

  IF v_has_red_flag AND v_status IN ('pending_paybox', 'pending_zoom') THEN
    RAISE EXCEPTION 'red_flag_blocks_checkout' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL OR v_phone IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_rate_count
    FROM public.onboarding_leads ol
    WHERE ol.updated_at > now() - interval '1 hour'
      AND (
        (v_email IS NOT NULL AND lower(btrim(COALESCE(ol.email, ''))) = v_email)
        OR (v_phone IS NOT NULL AND btrim(COALESCE(ol.phone, '')) = v_phone)
      );
    IF v_rate_count >= 5 THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_lead_id IS NULL THEN
    IF v_full_name IS NULL OR v_phone IS NULL OR v_email IS NULL THEN
      RAISE EXCEPTION 'missing_contact_details' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.onboarding_leads
      (full_name, phone, email, pain_level, status, questionnaire_data)
    VALUES
      (v_full_name, v_phone, v_email, p_pain_level, 'abandoned', v_questionnaire)
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  SELECT status, pain_level INTO v_current_status, v_pain
  FROM public.onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = 'converted' THEN
    RAISE EXCEPTION 'lead_locked' USING ERRCODE = '22023';
  END IF;

  IF v_current_status IN ('pending_paybox', 'pending_zoom') AND v_status = 'abandoned' THEN
    v_status := v_current_status;
  END IF;

  v_pain := COALESCE(p_pain_level, v_pain);

  IF v_status = 'pending_paybox' AND v_pain IS NOT NULL AND v_pain >= 8 THEN
    RAISE EXCEPTION 'high_pain_blocks_generic_plan' USING ERRCODE = '22023';
  END IF;

  UPDATE public.onboarding_leads
  SET
    full_name = COALESCE(v_full_name, full_name),
    phone = COALESCE(v_phone, phone),
    email = COALESCE(v_email, email),
    pain_level = COALESCE(p_pain_level, pain_level),
    status = v_status,
    questionnaire_data = CASE
      WHEN p_questionnaire IS NULL THEN questionnaire_data
      ELSE v_questionnaire
    END
  WHERE id = p_lead_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.save_onboarding_lead(uuid, text, text, text, integer, text, jsonb) IS
  'Public funnel write path. Triage: red flags / pain≥8 block checkout. Rate limit ≤5/hour per email or phone.';

REVOKE ALL ON FUNCTION public.save_onboarding_lead(uuid, text, text, text, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_onboarding_lead(uuid, text, text, text, integer, text, jsonb) TO anon, authenticated;

-- ── FORCE RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.onboarding_leads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.program_review_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.program_review_engine_status FORCE ROW LEVEL SECURITY;

-- ── Proposal UPDATE ownership re-check ──────────────────────────────────────

DROP POLICY IF EXISTS "program_review_proposals_update_therapist"
  ON public.program_review_proposals;
CREATE POLICY "program_review_proposals_update_therapist"
  ON public.program_review_proposals
  FOR UPDATE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text)
  WITH CHECK (
    therapist_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

-- ── Atomic approve / decline RPCs ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_program_review_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := (SELECT auth.uid())::text;
  v_role text := COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '');
  v_row public.program_review_proposals%ROWTYPE;
  v_prev_id uuid;
  v_prev_version integer;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL OR v_role <> 'therapist' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT * INTO v_row
  FROM public.program_review_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.therapist_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = v_row.patient_id AND p.therapist_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_mismatch');
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
    left(format('אישור ביקורת 3 ימים (%s): %s', v_row.decision, coalesce(v_row.rationale, '')), 240),
    now()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.clinical_audit_logs (
    therapist_id, patient_id, entity_type, action, old_value, new_value
  )
  VALUES (
    v_uid,
    v_row.patient_id,
    'recommendation',
    'approve',
    jsonb_build_object('proposalId', v_row.id, 'decision', v_row.decision, 'metrics', v_row.metrics),
    jsonb_build_object('proposalId', v_row.id, 'status', 'approved', 'planId', v_new_id, 'approvedAt', now())
  );

  UPDATE public.program_review_proposals
  SET status = 'approved', resolved_at = now(), resolved_by = v_uid
  WHERE id = v_row.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_race' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'patientId', v_row.patient_id, 'planId', v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_program_review_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := (SELECT auth.uid())::text;
  v_role text := COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '');
  v_row public.program_review_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_role <> 'therapist' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT * INTO v_row
  FROM public.program_review_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.therapist_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  INSERT INTO public.clinical_audit_logs (
    therapist_id, patient_id, entity_type, action, old_value, new_value
  )
  VALUES (
    v_uid,
    v_row.patient_id,
    'recommendation',
    'decline',
    jsonb_build_object('proposalId', v_row.id, 'decision', v_row.decision),
    jsonb_build_object('proposalId', v_row.id, 'status', 'declined', 'declinedAt', now())
  );

  UPDATE public.program_review_proposals
  SET status = 'declined', resolved_at = now(), resolved_by = v_uid
  WHERE id = v_row.id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_race' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'patientId', v_row.patient_id);
END;
$$;

COMMENT ON FUNCTION public.approve_program_review_proposal(uuid) IS
  'Therapist-only atomic approve: lock pending → versioned plan → audit → approved.';
COMMENT ON FUNCTION public.decline_program_review_proposal(uuid) IS
  'Therapist-only atomic decline: lock pending → audit → declined.';

REVOKE ALL ON FUNCTION public.approve_program_review_proposal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_program_review_proposal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_program_review_proposal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_program_review_proposal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_program_review_proposal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_program_review_proposal(uuid) TO authenticated, service_role;

-- ── Hard delete RPCs ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hard_delete_patient(p_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := (SELECT auth.uid())::text;
  v_role text := COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '');
  v_pid text := nullif(btrim(coalesce(p_patient_id, '')), '');
  v_tid text;
BEGIN
  IF v_uid IS NULL OR v_role <> 'therapist' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_patient_id');
  END IF;

  SELECT therapist_id INTO v_tid
  FROM public.patients
  WHERE id = v_pid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_tid IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  DELETE FROM public.patients WHERE id = v_pid AND therapist_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'delete_failed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'patientId', v_pid);
END;
$$;

CREATE OR REPLACE FUNCTION public.hard_delete_onboarding_lead(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := (SELECT auth.uid())::text;
  v_role text := COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '');
BEGIN
  IF v_uid IS NULL OR v_role <> 'therapist' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_lead_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_lead_id');
  END IF;

  DELETE FROM public.onboarding_leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'leadId', p_lead_id);
END;
$$;

COMMENT ON FUNCTION public.hard_delete_patient(text) IS
  'Therapist-only hard delete of owned patient. Cascades clinical rows; auth.users removed by trigger.';
COMMENT ON FUNCTION public.hard_delete_onboarding_lead(uuid) IS
  'Therapist-only permanent delete of an onboarding lead row.';

REVOKE ALL ON FUNCTION public.hard_delete_patient(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hard_delete_onboarding_lead(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hard_delete_patient(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_onboarding_lead(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_patient(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_onboarding_lead(uuid) TO authenticated, service_role;

-- ── Revoke anon on patient_row_owned_by_caller ──────────────────────────────

REVOKE ALL ON FUNCTION public.patient_row_owned_by_caller(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.patient_row_owned_by_caller(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.patient_row_owned_by_caller(text) TO authenticated;

-- ── Engine status — require therapist role ──────────────────────────────────

DROP POLICY IF EXISTS "program_review_engine_status_select_therapist"
  ON public.program_review_engine_status;
CREATE POLICY "program_review_engine_status_select_therapist"
  ON public.program_review_engine_status
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

DROP POLICY IF EXISTS "program_review_engine_status_update_therapist"
  ON public.program_review_engine_status;
CREATE POLICY "program_review_engine_status_update_therapist"
  ON public.program_review_engine_status
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  )
  WITH CHECK (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );
