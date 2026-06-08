-- Keep only the earliest intake row per patient (Initial Intake / קבלה ראשונית).
WITH ranked AS (
  SELECT
    id,
    patient_id,
    ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY created_at ASC) AS rn
  FROM public.patient_intakes
)
DELETE FROM public.patient_intakes pi
USING ranked r
WHERE pi.id = r.id
  AND r.rn > 1;

-- Mark surviving rows as immutable initial intake.
UPDATE public.patient_intakes pi
SET intake_data = COALESCE(pi.intake_data, '{}'::jsonb)
  || jsonb_build_object('kind', 'initial', 'immutable', true)
WHERE TRUE;
