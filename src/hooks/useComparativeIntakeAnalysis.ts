import { useCallback, useRef, useState } from 'react';
import type { Patient, PatientIntakeArchive, PatientIntakeVersionEntry } from '../types';
import { getGeminiApiKey, GeminiRateLimitedError } from '../ai/geminiClient';
import {
  analyzeIntakeVersusCurrentCare,
  buildStructuredIntakeForComparative,
  type IntakeComparativeAiResult,
} from '../ai/geminiIntakeComparativeFollowup';
import { buildSupabaseClinicalDatastoreJson } from '../utils/buildSupabaseClinicalDatastoreJson';
import { resolveCoreLegacyIntakeSummaryText } from '../utils/clinicalIntakeProfileMigration';
import type { ClinicalIntakeEditableFields } from '../utils/clinicalIntakeEditableFields';
import { mapAiResponseToFields } from '../utils/medicalIntakeSchema';
import {
  buildAnalysisVersionEntry,
  cloneSuccessiveIntakeVersion,
  insertIntakeVersion,
  updateIntakeVersion,
  type UpsertIntakeVersionResult,
} from '../utils/clinicalIntakeVersions';

function fallbackIntakeFromPatient(p: Patient): PatientIntakeArchive {
  const coreIntakeText = resolveCoreLegacyIntakeSummaryText(p) ?? p.therapistNotes;
  return {
    capturedAt: p.joinDate,
    primaryBodyArea: p.primaryBodyArea,
    libraryExerciseIds: [],
    diagnosis: p.diagnosis,
    therapistNotes: coreIntakeText,
    extras: {
      intakeStory: coreIntakeText,
      ...(p.clinicalIntakeProfile ? { clinicalIntakeProfile: p.clinicalIntakeProfile } : {}),
      ...(p.clinicalIntakeAiInsights
        ? { clinicalIntakeAiInsights: p.clinicalIntakeAiInsights }
        : {}),
      clinicalDiagnosis: p.diagnosis,
    },
  };
}

function formatAiError(err: unknown): string {
  if (err instanceof GeminiRateLimitedError) return err.message;
  if (err instanceof Error) return err.message;
  return 'שגיאה בניתוח';
}

type Options = {
  patient: Patient;
  updatePatient: (id: string, patch: Partial<Patient>) => void;
  saveToCloud: () => Promise<boolean | void>;
};

export function useComparativeIntakeAnalysis({ patient, updatePatient, saveToCloud }: Options) {
  const [busy, setBusy] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeComparativeAiResult | null>(null);
  const [pendingVersion, setPendingVersion] = useState<PatientIntakeVersionEntry | null>(null);
  const [pendingFields, setPendingFields] = useState<ClinicalIntakeEditableFields | null>(null);

  const patientRef = useRef(patient);
  patientRef.current = patient;

  const intake = patient.initialIntakeArchive ?? fallbackIntakeFromPatient(patient);

  const runComparative = useCallback(
    async (currentFields: ClinicalIntakeEditableFields) => {
      if (!getGeminiApiKey()) {
        setError('הגדירו Supabase ופרסמו את gemini-proxy עם GEMINI_API_KEY.');
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const structured = buildStructuredIntakeForComparative(patient, intake);
        const normalizedArchive: PatientIntakeArchive = {
          ...intake,
          therapistNotes: structured.caseStory || intake.therapistNotes,
          extras: {
            ...(intake.extras ?? {}),
            intakeStory: structured.caseStory || intake.extras?.intakeStory,
            ...(structured.clinicalIntakeProfile
              ? { clinicalIntakeProfile: structured.clinicalIntakeProfile }
              : {}),
            ...(structured.aiInsights
              ? { clinicalIntakeAiInsights: structured.aiInsights }
              : {}),
          },
        };

        const datastoreJson = await buildSupabaseClinicalDatastoreJson(patient.id);
        const analysis = await analyzeIntakeVersusCurrentCare(
          patient,
          normalizedArchive,
          datastoreJson,
          currentFields
        );
        setResult(analysis);

        const version = buildAnalysisVersionEntry(currentFields, analysis);
        const mappedFields = mapAiResponseToFields(analysis, currentFields);
        setPendingVersion(version);
        setPendingFields(mappedFields);
        return analysis;
      } catch (e) {
        setError(formatAiError(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [patient, intake]
  );

  const handleConfirm = useCallback(
    async (editedFields: ClinicalIntakeEditableFields): Promise<UpsertIntakeVersionResult | null> => {
      if (!pendingVersion) return null;
      setConfirmBusy(true);
      setError(null);
      try {
        const currentPatient = patientRef.current;
        const saved = await insertIntakeVersion(
          currentPatient.id,
          currentPatient,
          pendingVersion,
          editedFields,
          { updatePatient, saveToCloud }
        );
        setPendingVersion(null);
        setPendingFields(null);
        setResult(null);
        return saved;
      } catch (e) {
        setError(formatAiError(e));
        return null;
      } finally {
        setConfirmBusy(false);
      }
    },
    [pendingVersion, updatePatient, saveToCloud]
  );

  const discardPending = useCallback(() => {
    setPendingVersion(null);
    setPendingFields(null);
    setResult(null);
    setError(null);
  }, []);

  const updatePendingFields = useCallback((fields: ClinicalIntakeEditableFields) => {
    setPendingFields(fields);
    setPendingVersion((prev) =>
      prev ? { ...prev, fields: JSON.parse(JSON.stringify(fields)) } : prev
    );
  }, []);

  const createSuccessiveVersion = useCallback(
    async (
      sourceVersion: PatientIntakeVersionEntry
    ): Promise<UpsertIntakeVersionResult | null> => {
      setCloneBusy(true);
      setError(null);
      try {
        const currentPatient = patientRef.current;
        return await cloneSuccessiveIntakeVersion(
          currentPatient.id,
          currentPatient,
          sourceVersion,
          { updatePatient, saveToCloud }
        );
      } catch (e) {
        setError(formatAiError(e));
        return null;
      } finally {
        setCloneBusy(false);
      }
    },
    [updatePatient, saveToCloud]
  );

  const handleUpdateVersion = useCallback(
    async (
      versionId: string,
      version: PatientIntakeVersionEntry,
      editedFields: ClinicalIntakeEditableFields
    ): Promise<UpsertIntakeVersionResult | null> => {
      setError(null);
      try {
        const currentPatient = patientRef.current;
        return await updateIntakeVersion(
          currentPatient.id,
          currentPatient,
          versionId,
          version,
          editedFields,
          { updatePatient, saveToCloud }
        );
      } catch (e) {
        setError(formatAiError(e));
        return null;
      }
    },
    [updatePatient, saveToCloud]
  );

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setPendingVersion(null);
    setPendingFields(null);
  }, []);

  return {
    busy,
    cloneBusy,
    confirmBusy,
    error,
    result,
    pendingVersion,
    pendingFields,
    runComparative,
    createSuccessiveVersion,
    handleConfirm,
    handleUpdateVersion,
    discardPending,
    updatePendingFields,
    reset,
    intake,
  };
}
