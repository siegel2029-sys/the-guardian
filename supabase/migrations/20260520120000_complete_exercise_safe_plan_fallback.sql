-- Allow completion when the portal-loaded plan row is not flagged is_active=true
-- (fetchActiveExercisePlanForPatient picks newest row regardless of is_active).
-- Accept optional plan_row_id in p_session_data as a validated fallback.

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
BEGIN
  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

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
  'Portal: marks exercise completed on active plan, or plan_row_id from session JSON, or newest plan for patient.';
