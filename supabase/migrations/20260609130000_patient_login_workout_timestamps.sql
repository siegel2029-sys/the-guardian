-- Separate portal login heartbeat from workout completion timestamps.

ALTER TABLE public.patients
  RENAME COLUMN last_activity_timestamp TO last_login_at;

COMMENT ON COLUMN public.patients.last_login_at IS
  'Updated when the patient authenticates or opens the portal; drives momentum reminder eligibility.';

DROP INDEX IF EXISTS public.idx_patients_last_activity;

CREATE INDEX IF NOT EXISTS idx_patients_last_login
  ON public.patients (last_login_at)
  WHERE last_login_at IS NOT NULL;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS last_workout_at TIMESTAMPTZ;

COMMENT ON COLUMN public.patients.last_workout_at IS
  'Updated when the patient completes an exercise or submits daily workout progress.';

CREATE INDEX IF NOT EXISTS idx_patients_last_workout
  ON public.patients (last_workout_at)
  WHERE last_workout_at IS NOT NULL;

-- Backfill from legacy payload field (clinical day → noon UTC).
UPDATE public.patients
SET last_workout_at = ((payload->>'lastSessionDate')::date + time '12:00') AT TIME ZONE 'UTC'
WHERE last_workout_at IS NULL
  AND NULLIF(trim(payload->>'lastSessionDate'), '') IS NOT NULL;

-- complete_exercise_safe: stamp last_workout_at on successful completion.
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

  SELECT ep.id, ep.exercises INTO v_plan_id, v_exercises
  FROM public.exercise_plans ep
  WHERE ep.patient_id = v_patient_id
    AND ep.is_active = true
  ORDER BY ep.version_number DESC NULLS LAST, ep.updated_at DESC NULLS LAST
  LIMIT 1;

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

  IF v_plan_id IS NULL THEN
    SELECT ep.id, ep.exercises INTO v_plan_id, v_exercises
    FROM public.exercise_plans ep
    WHERE ep.patient_id = v_patient_id
    ORDER BY ep.version_number DESC NULLS LAST, ep.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

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
      last_workout_at = now(),
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

  UPDATE public.patients p
  SET last_workout_at = now(), updated_at = now()
  WHERE p.id = v_patient_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.complete_exercise_safe(text, jsonb) IS
  'Portal: marks exercise completed; updates last_workout_at on patients.';
