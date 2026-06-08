import { useCallback, useMemo } from 'react';
import { LayoutDashboard } from 'lucide-react';
import type { Patient, PatientClinicalIntakeProfile, PatientIntakeVersionEntry } from '../../../types';
import { resolvePatientClinicalIntakeProfile } from '../../../utils/clinicalIntakeProfileDisplay';
import { buildClinicalIntakeInsightsDisplay } from '../../../utils/clinicalIntakeInsightsDisplay';
import type { ClinicalIntakeEditableFields } from '../../../utils/clinicalIntakeEditableFields';
import {
  resolveIntakeVersionTimeline,
  type UpsertIntakeVersionResult,
} from '../../../utils/clinicalIntakeVersions';
import ClinicalIntakeTabbedView from './ClinicalIntakeTabbedView';

type Props = {
  patient?: Patient;
  profile?: PatientClinicalIntakeProfile;
  compact?: boolean;
  className?: string;
  tabbed?: boolean;
  onSaveTimeline?: (patch: Partial<Patient>) => void | Promise<void>;
  onRunComparativeAnalysis?: (
    currentFields: ClinicalIntakeEditableFields
  ) => void | Promise<unknown>;
  comparativeBusy?: boolean;
  comparativeError?: string | null;
  pendingVersion?: PatientIntakeVersionEntry | null;
  pendingFields?: ClinicalIntakeEditableFields | null;
  onPendingFieldsChange?: (fields: ClinicalIntakeEditableFields) => void;
  onConfirmPending?: (
    fields: ClinicalIntakeEditableFields
  ) => Promise<UpsertIntakeVersionResult | null>;
  onUpdateIntakeVersion?: (
    versionId: string,
    version: PatientIntakeVersionEntry,
    fields: ClinicalIntakeEditableFields
  ) => Promise<UpsertIntakeVersionResult | null>;
  onDiscardPending?: () => void;
  onCreateSuccessiveVersion?: (
    sourceVersion: PatientIntakeVersionEntry
  ) => Promise<UpsertIntakeVersionResult | null>;
  confirmBusy?: boolean;
  cloneBusy?: boolean;
  updatePatient?: (id: string, patch: Partial<Patient>) => void;
};

export default function ClinicalIntakeProfilePanel({
  patient,
  profile: profileProp,
  compact = false,
  className = '',
  tabbed = true,
  onSaveTimeline,
  onRunComparativeAnalysis,
  comparativeBusy = false,
  comparativeError = null,
  pendingVersion = null,
  pendingFields = null,
  onPendingFieldsChange,
  onConfirmPending,
  onUpdateIntakeVersion,
  onDiscardPending,
  onCreateSuccessiveVersion,
  confirmBusy = false,
  cloneBusy = false,
  updatePatient,
}: Props) {
  const resolvedProfile = useMemo(() => {
    if (patient) return resolvePatientClinicalIntakeProfile(patient);
    return profileProp;
  }, [patient, profileProp]);

  const timeline = useMemo(
    () => (patient ? resolveIntakeVersionTimeline(patient) : []),
    [patient]
  );

  const hasInsights = useMemo(
    () => (patient ? buildClinicalIntakeInsightsDisplay(patient).hasAnyInsights : false),
    [patient]
  );

  const hasProfileData = useMemo(() => {
    if (!resolvedProfile) return false;
    return Boolean(
      resolvedProfile.ranges?.length ||
        resolvedProfile.muscle_strength?.trim() ||
        resolvedProfile.goals?.length ||
        resolvedProfile.medical_history?.backgroundDiseases?.trim() ||
        resolvedProfile.medical_history?.chronicMedications?.trim()
    );
  }, [resolvedProfile]);

  const handleSaveTimeline = useCallback(
    (patch: Partial<Patient>) => {
      if (!onSaveTimeline) return;
      return onSaveTimeline(patch);
    },
    [onSaveTimeline]
  );

  const hasAnyIntakeData =
    hasInsights ||
    hasProfileData ||
    timeline.length > 0;

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      aria-label="תיק אינטייק קליני"
      dir="rtl"
    >
      <div
        className={`flex items-center gap-2 border-b border-slate-100 bg-gradient-to-l from-sky-50/80 to-slate-50/80 ${
          compact ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <LayoutDashboard
          className={`shrink-0 text-teal-700 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className={`font-black text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>
            תיק אינטייק קליני
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
            ציר גרסאות — קבלה ראשונית וניתוחים השוואתיים במבנה רפואי אחיד
          </p>
        </div>
      </div>

      <div className={compact ? 'p-3' : 'p-4 sm:p-5'}>
        {patient && tabbed && onSaveTimeline ? (
          <ClinicalIntakeTabbedView
            patient={patient}
            compact={compact}
            onSaveTimeline={handleSaveTimeline}
            onRunComparativeAnalysis={onRunComparativeAnalysis}
            comparativeBusy={comparativeBusy}
            comparativeError={comparativeError}
            pendingVersion={pendingVersion}
            pendingFields={pendingFields}
            onPendingFieldsChange={onPendingFieldsChange}
            onConfirmPending={onConfirmPending}
            onUpdateIntakeVersion={onUpdateIntakeVersion}
            onDiscardPending={onDiscardPending}
            onCreateSuccessiveVersion={onCreateSuccessiveVersion}
            confirmBusy={confirmBusy}
            cloneBusy={cloneBusy}
            updatePatient={updatePatient}
          />
        ) : patient ? (
          <p className="text-sm text-slate-500 italic text-center py-2">
            אין הרשאת שמירה לתצוגת אינטייק.
          </p>
        ) : (
          <p className="text-sm text-slate-500 italic text-center py-2">
            אין נתוני מטופל לתצוגת דוח אינטייק.
          </p>
        )}

        {!hasAnyIntakeData && patient && (
          <p className="text-sm text-slate-500 italic text-center py-2 mt-4">
            אין עדיין נתוני אינטייק — השלימו אינטייק קליני.
          </p>
        )}
      </div>
    </section>
  );
}
