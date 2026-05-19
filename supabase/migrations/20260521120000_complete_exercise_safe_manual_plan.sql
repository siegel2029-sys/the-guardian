-- When exercise_plans has no row for the patient (portal reads _exercisePlanCache
-- from patients.payload instead), allow completion via is_manual_plan in session JSON.

CREATE OR REPLACE FUNCTION public.complete_exercise_safe(
  p_exercise_id text,
  p_session_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id text;
  v_plan_id uuid;
  v_exercises jsonb;
  v_found boolean := false;
  v_plan_row_id uuid;
  v_is_manual_plan boolean := false;
BEGIN
  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  v_is_manual_plan := COALESCE(
    (p_session_data->>'is_manual_plan')::boolean,
    (p_session_data->'is_manual_plan')::text = 'true',
    false
  );

  -- 1) Canonical active plan
  SELECT ep.id, ep.exercises INTO v_plan_id, v_exercises
  FROM public.exercise_plans ep
  WHERE ep.patient_id = v_patient_id
    AND ep.is_active = true
  ORDER BY ep.version_number DESC NULLS LAST, ep.updated_at DESC NULLS LAST
  LIMIT 1;

  -- 2) Client-supplied plan row (must belong to this patient)
  IF v_plan_id IS NULL
     AND p_session_data ? 'plan_row_id'
     AND NULLIF(trim(p_session_data->>'plan_row_id'), '') IS NOT NULL THEN
    BEGIN
      v_plan_row_id := (p_session_data->>'plan_row_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_plan_row_id := NULL;
    END;

    IF v_plan_row_id IS NOT NULL THEN
      SELECT ep.id, ep.exercises INTO v_plan_id, v_exercises
      FROM public.exercise_plans ep
      WHERE ep.id = v_plan_row_id
        AND ep.patient_id = v_patient_id
      LIMIT 1;
    END IF;
  END IF;

  -- 3) Newest plan row for patient (matches portal fetch fallback)
  IF v_plan_id IS NULL THEN
    SELECT ep.id, ep.exercises INTO v_plan_id, v_exercises
    FROM public.exercise_plans ep
    WHERE ep.patient_id = v_patient_id
    ORDER BY ep.version_number DESC NULLS LAST, ep.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 4) Cached manual plan in patients.payload._exercisePlanCache
  IF v_plan_id IS NULL AND v_is_manual_plan THEN
    SELECT p.payload->'_exercisePlanCache' INTO v_exercises
    FROM public.patients p
    WHERE p.id = v_patient_id
    LIMIT 1;

    IF v_exercises IS NULL OR jsonb_typeof(v_exercises) <> 'array' OR jsonb_array_length(v_exercises) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'no_cached_plan');
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_exercises) AS elem
      WHERE elem->>'id' = p_exercise_id
    ) INTO v_found;

    IF NOT v_found THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'exercise_not_in_plan');
    END IF;

    UPDATE public.patients p
    SET
      payload = jsonb_set(
        COALESCE(p.payload, '{}'::jsonb),
        '{_exercisePlanCache}',
        (
          SELECT COALESCE(
            jsonb_agg(
              CASE
                WHEN elem->>'id' = p_exercise_id THEN
                  elem
                    || jsonb_build_object(
                      'status',
                      'completed',
                      'completed_at',
                      to_jsonb(now() AT TIME ZONE 'utc')
                    )
                ELSE elem
              END
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(COALESCE(p.payload->'_exercisePlanCache', '[]'::jsonb)) AS elem
        ),
        true
      ),
      updated_at = now()
    WHERE p.id = v_patient_id;

    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_active_plan');
  END IF;

  IF v_exercises IS NULL OR jsonb_typeof(v_exercises) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_exercises');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_exercises) AS elem
    WHERE elem->>'id' = p_exercise_id
  ) INTO v_found;

  IF NOT v_found THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exercise_not_in_plan');
  END IF;

  UPDATE public.exercise_plans ep
  SET
    exercises = (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN elem->>'id' = p_exercise_id THEN
              elem
                || jsonb_build_object(
                  'status',
                  'completed',
                  'completed_at',
                  to_jsonb(now() AT TIME ZONE 'utc')
                )
            ELSE elem
          END
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(ep.exercises) AS elem
    ),
    updated_at = now()
  WHERE ep.id = v_plan_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.complete_exercise_safe(text, jsonb) IS
  'Portal: marks exercise completed on active plan, plan_row_id fallback, newest plan, or patients.payload._exercisePlanCache when is_manual_plan=true.';
