import { useCallback, useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import type { Patient, PatientClinicalIntakeProfile } from '../../../types';
import { resolvePatientClinicalIntakeProfile } from '../../../utils/clinicalIntakeProfileDisplay';
import { buildClinicalIntakeInsightsDisplay } from '../../../utils/clinicalIntakeInsightsDisplay';
import { buildPatientPatchFromEditableIntakeFields } from '../../../utils/clinicalIntakeEditableFields';
import ClinicalIntakeEditableInsightsPanel from './ClinicalIntakeEditableInsightsPanel';
import StructuredClinicalIntakeMetricsBar from './StructuredClinicalIntakeMetricsBar';

type Props = {
  patient?: Patient;
  /** תצוגה ישירה (למשל שלב סקירה באשף) — ללא patient */
  profile?: PatientClinicalIntakeProfile;
  compact?: boolean;
  className?: string;
  /** שמירת עריכות AI לפרופיל המטופל (דשבורד מטפל) */
  onSaveInsights?: (
    patch: ReturnType<typeof buildPatientPatchFromEditableIntakeFields>
  ) => void | Promise<void>;
};

export default function ClinicalIntakeProfilePanel({
  patient,
  profile: profileProp,
  compact = false,
  className = '',
  onSaveInsights,
}: Props) {
  const resolvedProfile = useMemo(() => {
    if (patient) return resolvePatientClinicalIntakeProfile(patient);
    return profileProp;
  }, [patient, profileProp]);

  const hasInsights = useMemo(
    () => (patient ? buildClinicalIntakeInsightsDisplay(patient).hasAnyInsights : false),
    [patient]
  );

  const hasMetrics =
    Boolean(resolvedProfile?.ranges?.length) ||
    Boolean(resolvedProfile?.muscle_strength?.trim()) ||
    Boolean(resolvedProfile?.goals?.length) ||
    Boolean(resolvedProfile?.medical_history?.backgroundDiseases?.trim()) ||
    Boolean(resolvedProfile?.medical_history?.chronicMedications?.trim());

  const handleSaveInsights = useCallback(
    (patch: ReturnType<typeof buildPatientPatchFromEditableIntakeFields>) => {
      if (!onSaveInsights) return;
      return onSaveInsights(patch);
    },
    [onSaveInsights]
  );

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      aria-label="סיכום אינטייק קליני"
      dir="rtl"
    >
      <div
        className={`flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 ${
          compact ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <ClipboardList
          className={`shrink-0 text-teal-700 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className={`font-black text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>
            סיכום אינטייק קליני
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
            ניתוח AI · עריכה חופשית · מדדים מובנים
          </p>
        </div>
      </div>

      <div className={compact ? 'p-3 space-y-3' : 'p-4 space-y-4'}>
        {patient ? (
          <ClinicalIntakeEditableInsightsPanel
            patient={patient}
            compact={compact}
            onSave={handleSaveInsights}
            showSaveButton={Boolean(onSaveInsights)}
          />
        ) : (
          <p className="text-sm text-slate-500 italic text-center py-2">
            אין נתוני מטופל לתצוגת ניתוח AI.
          </p>
        )}

        {hasMetrics || resolvedProfile ? (
          <StructuredClinicalIntakeMetricsBar profile={resolvedProfile} />
        ) : null}

        {!hasInsights && !hasMetrics && (
          <p className="text-sm text-slate-500 italic text-center py-2">
            אין עדיין נתוני אינטייק — השלימו אינטייק קליני.
          </p>
        )}
      </div>
    </section>
  );
}
