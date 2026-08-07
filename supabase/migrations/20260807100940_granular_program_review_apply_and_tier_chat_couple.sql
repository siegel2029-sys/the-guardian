-- =============================================================================
-- Granular patient apply + hard-couple subscription_tier ↔ allow_chat
-- =============================================================================
-- patient_apply_program_review_items: client sends accepted changeKeys only;
-- server merges those proposed_changes onto the CURRENT live plan (no client plan body).
-- Tier coupling: generic ⇒ allow_chat false; premium ⇒ allow_chat true.
-- =============================================================================

-- ── 1. Tier ↔ chat coupling on patients sync ─────────────────────────────────

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
  ELSIF NEW.payload ? 'subscriptionTier' OR NEW.payload ? 'subscription_tier' THEN
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

  -- Strict product rule: Generic = no human chat; Premium = chat enabled.
  IF NEW.subscription_tier = 'generic' THEN
    NEW.allow_chat := false;
  ELSE
    NEW.allow_chat := true;
  END IF;

  IF NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'object' THEN
    NEW.payload := COALESCE(NEW.payload, '{}'::jsonb);
  END IF;

  NEW.payload := jsonb_set(NEW.payload, '{subscriptionTier}', to_jsonb(NEW.subscription_tier), true);
  NEW.payload := jsonb_set(NEW.payload, '{allowChat}', to_jsonb(NEW.allow_chat), true);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_patients_sync_subscription_tier() IS
  'Keeps subscription_tier ↔ payload.subscriptionTier and forces allow_chat from tier (generic=false, premium=true).';

-- Backfill chat from tier for existing rows.
UPDATE public.patients
SET allow_chat = (subscription_tier = 'premium'),
    payload = CASE
      WHEN payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
        jsonb_build_object(
          'subscriptionTier', subscription_tier,
          'allowChat', subscription_tier = 'premium'
        )
      ELSE
        jsonb_set(
          jsonb_set(payload, '{subscriptionTier}', to_jsonb(subscription_tier), true),
          '{allowChat}',
          to_jsonb(subscription_tier = 'premium'),
          true
        )
    END
WHERE allow_chat IS DISTINCT FROM (subscription_tier = 'premium')
   OR (payload ->> 'allowChat') IS DISTINCT FROM CASE WHEN subscription_tier = 'premium' THEN 'true' ELSE 'false' END
   OR (payload ->> 'subscriptionTier') IS DISTINCT FROM subscription_tier;

-- ── 2. Helpers: changeKey + merge accepted changes onto live plan ────────────

CREATE OR REPLACE FUNCTION public.program_review_change_key(p_change jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT
    coalesce(p_change ->> 'exerciseId', '')
    || ':'
    || coalesce(p_change ->> 'action', '')
    || ':'
    || coalesce(p_change ->> 'swapToExerciseId', '');
$$;

CREATE OR REPLACE FUNCTION public.merge_program_review_accepted_changes(
  p_current_exercises jsonb,
  p_proposed_changes jsonb,
  p_proposed_exercises jsonb,
  p_accepted_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_next jsonb;
  v_key text;
  v_change jsonb;
  v_action text;
  v_ex_id text;
  v_idx int;
  v_len int;
  v_found boolean;
  v_snap jsonb;
  v_swap_id text;
  v_i int;
  v_el jsonb;
  v_accepted text[];
  v_valid_keys text[] := ARRAY[]::text[];
  v_declined_note text;
BEGIN
  IF jsonb_typeof(p_current_exercises) <> 'array' THEN
    RAISE EXCEPTION 'invalid_current_plan' USING ERRCODE = '22023';
  END IF;

  IF p_accepted_keys IS NULL OR cardinality(p_accepted_keys) = 0 THEN
    RAISE EXCEPTION 'no_accepted_keys' USING ERRCODE = '22023';
  END IF;

  -- Normalize keys
  SELECT array_agg(DISTINCT btrim(k)) INTO v_accepted
  FROM unnest(p_accepted_keys) AS k
  WHERE btrim(k) <> '';

  IF v_accepted IS NULL OR cardinality(v_accepted) = 0 THEN
    RAISE EXCEPTION 'no_accepted_keys' USING ERRCODE = '22023';
  END IF;

  -- Build valid actionable keys from proposal
  IF jsonb_typeof(p_proposed_changes) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(p_proposed_changes) - 1 LOOP
      v_change := p_proposed_changes -> v_i;
      IF coalesce(v_change ->> 'action', '') <> 'keep'
         AND coalesce(v_change ->> 'action', '') <> '' THEN
        v_valid_keys := array_append(v_valid_keys, public.program_review_change_key(v_change));
      END IF;
    END LOOP;
  END IF;

  FOREACH v_key IN ARRAY v_accepted LOOP
    IF NOT (v_key = ANY (v_valid_keys)) THEN
      RAISE EXCEPTION 'unknown_change_key' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_next := p_current_exercises;

  FOREACH v_key IN ARRAY v_accepted LOOP
    v_change := NULL;
    FOR v_i IN 0 .. jsonb_array_length(p_proposed_changes) - 1 LOOP
      IF public.program_review_change_key(p_proposed_changes -> v_i) = v_key THEN
        v_change := p_proposed_changes -> v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_change IS NULL THEN
      RAISE EXCEPTION 'unknown_change_key' USING ERRCODE = '22023';
    END IF;

    v_action := coalesce(v_change ->> 'action', '');
    v_ex_id := coalesce(v_change ->> 'exerciseId', '');
    v_len := jsonb_array_length(v_next);
    v_idx := -1;
    FOR v_i IN 0 .. v_len - 1 LOOP
      IF coalesce(v_next -> v_i ->> 'id', '') = v_ex_id THEN
        v_idx := v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_action IN ('swap', 'progress_swap') THEN
      IF v_idx < 0 THEN
        RAISE EXCEPTION 'exercise_missing' USING ERRCODE = '22023';
      END IF;
      v_swap_id := coalesce(v_change ->> 'swapToExerciseId', '');
      IF v_swap_id = '' THEN
        RAISE EXCEPTION 'invalid_swap' USING ERRCODE = '22023';
      END IF;

      v_snap := NULL;
      IF jsonb_typeof(p_proposed_exercises) = 'array' THEN
        FOR v_i IN 0 .. jsonb_array_length(p_proposed_exercises) - 1 LOOP
          v_el := p_proposed_exercises -> v_i;
          IF coalesce(v_el ->> 'replacedExerciseId', '') = v_ex_id
             OR coalesce(v_el ->> 'id', '') = v_swap_id THEN
            v_snap := v_el;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      v_el := coalesce(v_next -> v_idx, '{}'::jsonb);
      IF v_snap IS NOT NULL THEN
        v_el := v_el || v_snap;
      END IF;
      v_el := v_el
        || jsonb_build_object(
          'id', v_swap_id,
          'name', coalesce(
            nullif(v_change ->> 'swapToExerciseName', ''),
            v_snap ->> 'name',
            v_el ->> 'name'
          ),
          'sets', coalesce((v_change ->> 'toSets')::int, (v_el ->> 'sets')::int, 1),
          'reps', coalesce((v_change ->> 'toReps')::int, (v_el ->> 'reps')::int, 0),
          'patientSets', coalesce((v_change ->> 'toSets')::int, (v_el ->> 'patientSets')::int, 1),
          'patientReps', coalesce((v_change ->> 'toReps')::int, (v_el ->> 'patientReps')::int, 0),
          'replacedExerciseId', v_ex_id
        );
      v_next := jsonb_set(v_next, ARRAY[v_idx::text], v_el, false);

    ELSIF v_action IN ('reduce_reps', 'reduce_sets', 'progress_reps', 'progress_sets') THEN
      IF v_idx < 0 THEN
        RAISE EXCEPTION 'exercise_missing' USING ERRCODE = '22023';
      END IF;
      v_el := coalesce(v_next -> v_idx, '{}'::jsonb);
      v_el := v_el || jsonb_build_object(
        'sets', coalesce((v_change ->> 'toSets')::int, (v_el ->> 'sets')::int, 1),
        'reps', coalesce((v_change ->> 'toReps')::int, (v_el ->> 'reps')::int, 0),
        'patientSets', coalesce((v_change ->> 'toSets')::int, (v_el ->> 'patientSets')::int, 1),
        'patientReps', coalesce((v_change ->> 'toReps')::int, (v_el ->> 'patientReps')::int, 0)
      );
      v_next := jsonb_set(v_next, ARRAY[v_idx::text], v_el, false);
    ELSE
      RAISE EXCEPTION 'unsupported_action' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF jsonb_array_length(v_next) = 0 THEN
    RAISE EXCEPTION 'empty_plan' USING ERRCODE = '22023';
  END IF;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.program_review_change_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_program_review_accepted_changes(jsonb, jsonb, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.program_review_change_key(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_program_review_accepted_changes(jsonb, jsonb, jsonb, text[]) TO service_role;

-- ── 3. Granular apply RPC ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.patient_apply_program_review_items(
  p_proposal_id uuid,
  p_accepted_change_keys text[]
)
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
  v_prev_exercises jsonb;
  v_new_exercises jsonb;
  v_new_id uuid;
  v_accepted_at timestamptz := now();
  v_accepted text[];
  v_declined text[] := ARRAY[]::text[];
  v_all_keys text[] := ARRAY[]::text[];
  v_i int;
  v_change jsonb;
  v_key text;
  v_summary text;
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

  SELECT array_agg(DISTINCT btrim(k)) INTO v_accepted
  FROM unnest(coalesce(p_accepted_change_keys, ARRAY[]::text[])) AS k
  WHERE btrim(k) <> '';

  IF v_accepted IS NULL OR cardinality(v_accepted) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_accepted_keys');
  END IF;

  IF jsonb_typeof(v_row.proposed_changes) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(v_row.proposed_changes) - 1 LOOP
      v_change := v_row.proposed_changes -> v_i;
      IF coalesce(v_change ->> 'action', '') <> 'keep'
         AND coalesce(v_change ->> 'action', '') <> '' THEN
        v_key := public.program_review_change_key(v_change);
        v_all_keys := array_append(v_all_keys, v_key);
        IF NOT (v_key = ANY (v_accepted)) THEN
          v_declined := array_append(v_declined, v_key);
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT id, version_number, exercises
  INTO v_prev_id, v_prev_version, v_prev_exercises
  FROM public.exercise_plans
  WHERE patient_id = v_row.patient_id AND is_active = true
  FOR UPDATE;

  IF v_prev_exercises IS NULL OR jsonb_typeof(v_prev_exercises) <> 'array'
     OR jsonb_array_length(v_prev_exercises) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_plan');
  END IF;

  BEGIN
    v_new_exercises := public.merge_program_review_accepted_changes(
      v_prev_exercises,
      v_row.proposed_changes,
      v_row.proposed_exercises,
      v_accepted
    );
  EXCEPTION
    WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
  END;

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
    v_new_exercises,
    COALESCE(v_prev_version, 0) + 1,
    true,
    v_prev_id,
    left(format(
      'אישור חלקי של מטופל (Generic) — %s/%s שינויים',
      cardinality(v_accepted),
      cardinality(v_all_keys)
    ), 240),
    now()
  )
  RETURNING id INTO v_new_id;

  v_summary := format(
    'ה-AI הציע שינויי תוכנית; המטופל אישר %s ודחה %s בתאריך %s',
    cardinality(v_accepted),
    cardinality(v_declined),
    to_char(v_accepted_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI')
  );

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
      'source', 'program_review_ai',
      'proposedChanges', v_row.proposed_changes
    ),
    jsonb_build_object(
      'proposalId', v_row.id,
      'status', 'approved',
      'planId', v_new_id,
      'acceptedAt', v_accepted_at,
      'acceptedBy', 'patient',
      'subscriptionTier', 'generic',
      'acceptedChangeKeys', to_jsonb(v_accepted),
      'declinedChangeKeys', to_jsonb(v_declined),
      'summaryHebrew', v_summary,
      'summaryEnglish', format(
        'AI proposed plan changes; patient accepted %s and declined %s on %s',
        cardinality(v_accepted),
        cardinality(v_declined),
        to_char(v_accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  );

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
    'acceptedAt', v_accepted_at,
    'acceptedCount', cardinality(v_accepted),
    'declinedCount', cardinality(v_declined)
  );
END;
$$;

-- Legacy whole-plan accept → apply all actionable keys (compat).
CREATE OR REPLACE FUNCTION public.patient_accept_program_review_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.program_review_proposals%ROWTYPE;
  v_keys text[] := ARRAY[]::text[];
  v_i int;
  v_change jsonb;
BEGIN
  SELECT * INTO v_row
  FROM public.program_review_proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF jsonb_typeof(v_row.proposed_changes) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(v_row.proposed_changes) - 1 LOOP
      v_change := v_row.proposed_changes -> v_i;
      IF coalesce(v_change ->> 'action', '') <> 'keep'
         AND coalesce(v_change ->> 'action', '') <> '' THEN
        v_keys := array_append(v_keys, public.program_review_change_key(v_change));
      END IF;
    END LOOP;
  END IF;

  IF cardinality(v_keys) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_accepted_keys');
  END IF;

  RETURN public.patient_apply_program_review_items(p_proposal_id, v_keys);
END;
$$;

COMMENT ON FUNCTION public.patient_apply_program_review_items(uuid, text[]) IS
  'Generic patient: apply only accepted proposed_changes keys onto live plan + audit footprint.';
COMMENT ON FUNCTION public.patient_accept_program_review_proposal(uuid) IS
  'Compat wrapper: accepts all actionable change keys via patient_apply_program_review_items.';

REVOKE ALL ON FUNCTION public.patient_apply_program_review_items(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.patient_apply_program_review_items(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.patient_apply_program_review_items(uuid, text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.patient_accept_program_review_proposal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.patient_accept_program_review_proposal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.patient_accept_program_review_proposal(uuid) TO authenticated, service_role;
