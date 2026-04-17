-- Patients must not UPDATE exercise_plans directly (they could overwrite clinical JSON).
-- Completion is recorded via complete_exercise_safe only (status + completed_at on the matching exercise object).

DROP POLICY IF EXISTS "exercise_plans_update_patient" ON public.exercise_plans;

-- ── RPC: mark one exercise completed on the active plan (clinical JSON unchanged except status/completed_at) ──
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
BEGIN
  -- p_session_data is accepted for API evolution (e.g. server-side logging later).
  -- This function intentionally does not merge p_session_data into the exercises JSON
  -- so patients cannot alter prescribed/clinical fields (the rest of each element).

  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT ep.id, ep.exercises INTO v_plan_id, v_exercises
  FROM public.exercise_plans ep
  WHERE ep.patient_id = v_patient_id
    AND ep.is_active = true
  LIMIT 1;

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

REVOKE ALL ON FUNCTION public.complete_exercise_safe(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_exercise_safe(text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.complete_exercise_safe(text, jsonb) IS
  'Portal: sets exercises[i].status and exercises[i].completed_at for p_exercise_id on the active plan; auth.uid() must match patients.auth_user_id. Prescribed/clinical keys on the element are not replaced.';
