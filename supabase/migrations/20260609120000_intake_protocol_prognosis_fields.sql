-- Document protocol/prognosis fields inside intake_data.fields JSONB snapshot.
COMMENT ON COLUMN public.patient_intakes.intake_data IS
  'JSON: kind, fields (caseStory, vasScore, diagnosis, clinicalIntakeProfile, treatmentProtocol, prognosisHypothesis, protocolTrackingState, …), medicalSchema, comparativeMeta, immutable, label';
