import { useCallback, useMemo, useRef } from 'react';
import { X, Archive } from 'lucide-react';
import type { Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { useComparativeIntakeAnalysis } from '../../../hooks/useComparativeIntakeAnalysis';
import ClinicalIntakeProfilePanel from './ClinicalIntakeProfilePanel';

type Props = {
  patient: Patient;
  onClose: () => void;
};

export default function FullIntakeVaultModal({ patient, onClose }: Props) {
  const { updatePatient, savePersistedStateToCloud } = usePatient();
  const intake = patient.initialIntakeArchive;
  const usingFallback = !patient.initialIntakeArchive;
  const patientIdRef = useRef(patient.id);
  patientIdRef.current = patient.id;

  const saveToCloud = useCallback(async () => {
    return savePersistedStateToCloud({ immediate: true });
  }, [savePersistedStateToCloud]);

  const comparative = useComparativeIntakeAnalysis({
    patient,
    updatePatient,
    saveToCloud,
  });

  const intakeMetaFields = useMemo(() => {
    if (!intake) return [];
    const ex = intake.extras ?? {};
    const injury =
      (ex.injuryHighlightSegments ?? []).map((a) => bodyAreaLabels[a]).join(', ') || null;
    const secondary =
      (ex.secondaryClinicalBodyAreas ?? []).map((a) => bodyAreaLabels[a]).join(', ') || null;

    const rows: { label: string; value: string }[] = [
      { label: 'תאריך צילום', value: new Date(intake.capturedAt).toLocaleString('he-IL') },
      { label: 'מוקד ראשי', value: bodyAreaLabels[intake.primaryBodyArea] },
    ];
    if (injury) rows.push({ label: 'הדגשת פגיעה', value: injury });
    if (secondary) rows.push({ label: 'משני קליני', value: secondary });
    if (ex.intakeRedFlag) rows.push({ label: 'דגל אדום באינטייק', value: 'כן' });
    return rows;
  }, [intake]);

  const handleSaveTimeline = useCallback(
    async (patch: Partial<Patient>) => {
      updatePatient(patientIdRef.current, patch);
      await savePersistedStateToCloud({ immediate: true });
    },
    [updatePatient, savePersistedStateToCloud]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-intake-vault-title"
      dir="rtl"
    >
      <div className="w-full sm:max-w-4xl max-h-[min(92dvh,900px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="full-intake-vault-title" className="text-lg font-black text-slate-950">
                סיכום אינטייק מלא
              </h2>
              {usingFallback && (
                <p className="text-xs text-amber-800 font-bold mt-1">
                  אין צילום אינטייק שמור — מוצגת גרסת בסיס.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
            aria-label="סגור"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-5 space-y-8">
            <ClinicalIntakeProfilePanel
              patient={patient}
              enableVersioning
              onSaveTimeline={handleSaveTimeline}
              onRunComparativeAnalysis={(fields, version, versionId) =>
                comparative.runComparative(fields, version, versionId)
              }
              comparativeBusy={comparative.busy}
              comparativeError={comparative.error}
              onUpdateIntakeVersion={(versionId, version, fields) =>
                comparative.handleUpdateVersion(versionId, version, fields)
              }
              onCreateSuccessiveVersion={(sourceVersion, tempId, optimisticTimeline) =>
                comparative.createSuccessiveVersion(sourceVersion, tempId, optimisticTimeline)
              }
              onDeleteIntakeVersion={(versionId, version, optimisticTimeline) =>
                comparative.handleDeleteVersion(versionId, version, optimisticTimeline)
              }
              cloneBusy={comparative.cloneBusy}
              updatePatient={updatePatient}
            />

            {intakeMetaFields.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-slate-950 mb-3">מטא־נתונים — קבלה ראשונית</h3>
                <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                  {intakeMetaFields.map((row) => (
                    <div
                      key={row.label}
                      className="px-4 py-2.5 flex flex-col sm:flex-row sm:gap-4 text-sm"
                    >
                      <dt className="font-bold text-slate-600 shrink-0 sm:w-36">{row.label}</dt>
                      <dd className="text-slate-900 flex-1 min-w-0 mt-0.5 sm:mt-0">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
