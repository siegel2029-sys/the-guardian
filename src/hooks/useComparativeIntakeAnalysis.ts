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
  cloneSuccessiveIntakeVersion,
  deleteIntakeVersion,
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
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeComparativeAiResult | null>(null);

  const patientRef = useRef(patient);
  patientRef.current = patient;

  const intake = patient.initialIntakeArchive ?? fallbackIntakeFromPatient(patient);

  /** Run AI on the active analysis tab and UPDATE that row in place (no extra tab). */
  const runComparative = useCallback(
    async (
      currentFields: ClinicalIntakeEditableFields,
      activeVersion: PatientIntakeVersionEntry,
      versionId: string
    ): Promise<UpsertIntakeVersionResult | null> => {
      if (!getGeminiApiKey()) {
        setError('הגדירו Supabase ופרסמו את gemini-proxy עם GEMINI_API_KEY.');
        return null;
      }
      if (activeVersion.kind === 'initial') {
        setError('ניתוח השוואתי זמין רק בגרסה חדשה — לחצו + ליד קבלה ראשונית.');
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const currentPatient = patientRef.current;
        const structured = buildStructuredIntakeForComparative(currentPatient, intake);
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

        const datastoreJson = await buildSupabaseClinicalDatastoreJson(currentPatient.id);
        const analysis = await analyzeIntakeVersusCurrentCare(
          currentPatient,
          normalizedArchive,
          datastoreJson,
          currentFields
        );
        setResult(analysis);

        const mappedFields = mapAiResponseToFields(analysis, currentFields);
        const updatedVersion: PatientIntakeVersionEntry = {
          ...activeVersion,
          fields: JSON.parse(JSON.stringify(mappedFields)) as PatientIntakeVersionEntry['fields'],
          medicalSchema: analysis.medicalSchema,
          comparativeMeta: {
            discrepancies: analysis.discrepancies,
            reevaluation: analysis.reevaluation,
          },
        };

        return await updateIntakeVersion(
          currentPatient.id,
          currentPatient,
          versionId,
          updatedVersion,
          mappedFields,
          { updatePatient, saveToCloud }
        );
      } catch (e) {
        setError(formatAiError(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [intake, updatePatient, saveToCloud]
  );

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

  const handleDeleteVersion = useCallback(
    async (
      versionId: string,
      version: PatientIntakeVersionEntry
    ): Promise<UpsertIntakeVersionResult | null> => {
      setError(null);
      setDeleteBusy(true);
      try {
        const currentPatient = patientRef.current;
        return await deleteIntakeVersion(
          currentPatient.id,
          currentPatient,
          versionId,
          version,
          { updatePatient, saveToCloud }
        );
      } catch (e) {
        setError(formatAiError(e));
        return null;
      } finally {
        setDeleteBusy(false);
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
  }, []);

  return {
    busy,
    cloneBusy,
    deleteBusy,
    error,
    result,
    runComparative,
    createSuccessiveVersion,
    handleDeleteVersion,
    handleUpdateVersion,
    reset,
    intake,
  };
}
