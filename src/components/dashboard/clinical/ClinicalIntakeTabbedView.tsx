import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckCircle2, FileStack, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Patient, PatientIntakeVersionEntry } from '../../../types';
import type { ClinicalIntakeEditableFields } from '../../../utils/clinicalIntakeEditableFields';
import {
  buildBootstrapTimelinePatchIfNeeded,
  buildPatchForArchiveIntakeVersion,
  buildPatchForLatestVersionSave,
  formatIntakeVersionTabLabel,
  getActiveVersionId,
  isPersistedIntakeVersionId,
  refreshIntakeVersionsFromDb,
  resolveIntakeVersionTimeline,
  type UpsertIntakeVersionResult,
} from '../../../utils/clinicalIntakeVersions';
import IntakeVersionEditor from './IntakeVersionEditor';

type Props = {
  patient: Patient;
  compact?: boolean;
  onSaveTimeline: (patch: Partial<Patient>) => void | Promise<void>;
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
  className?: string;
};

function versionFieldsSnapshot(v: PatientIntakeVersionEntry): ClinicalIntakeEditableFields {
  return JSON.parse(JSON.stringify(v.fields)) as ClinicalIntakeEditableFields;
}

function timelineSignature(timeline: PatientIntakeVersionEntry[]): string {
  return timeline.map((v) => `${v.id}:${v.createdAt}:${v.kind}`).join('|');
}

export default function ClinicalIntakeTabbedView({
  patient,
  compact = false,
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
  className = '',
}: Props) {
  const onSaveTimelineRef = useRef(onSaveTimeline);
  useEffect(() => {
    onSaveTimelineRef.current = onSaveTimeline;
  }, [onSaveTimeline]);

  const resolvedTimeline = useMemo(
    () => resolveIntakeVersionTimeline(patient),
    [patient.id, patient.intakeVersionTimeline]
  );

  const [intakeVersions, setIntakeVersions] = useState<PatientIntakeVersionEntry[]>(resolvedTimeline);
  const [activeVersionId, setActiveVersionId] = useState(() => getActiveVersionId(resolvedTimeline));
  const [draftFields, setDraftFields] = useState<ClinicalIntakeEditableFields | null>(() => {
    const active = resolvedTimeline[resolvedTimeline.length - 1];
    return active ? versionFieldsSnapshot(active) : null;
  });

  const timelineSigRef = useRef(timelineSignature(resolvedTimeline));
  const bootstrapAttemptedRef = useRef(false);
  const localEditVersionIdRef = useRef<string | null>(null);
  const keepActiveIdRef = useRef<string | null>(null);
  const pendingVersionIdRef = useRef<string | null>(null);
  const activatedPendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    bootstrapAttemptedRef.current = false;
    timelineSigRef.current = '';
    localEditVersionIdRef.current = null;
    keepActiveIdRef.current = null;
    pendingVersionIdRef.current = null;
    activatedPendingIdRef.current = null;
  }, [patient.id]);

  // Load authoritative version list from patient_intakes (re-fetch after mount).
  useEffect(() => {
    if (!updatePatient) return;
    let cancelled = false;

    void (async () => {
      try {
        const timeline = await refreshIntakeVersionsFromDb(patient.id, patient, updatePatient);
        if (cancelled || pendingVersionIdRef.current || timeline.length === 0) return;

        const sig = timelineSignature(timeline);
        if (sig === timelineSigRef.current) return;
        timelineSigRef.current = sig;
        setIntakeVersions(timeline);

        const latestId = getActiveVersionId(timeline);
        setActiveVersionId((prev) => (timeline.some((v) => v.id === prev) ? prev : latestId));

        const active =
          timeline.find((v) => v.id === latestId) ?? timeline[timeline.length - 1];
        if (active) setDraftFields(versionFieldsSnapshot(active));
      } catch {
        /* offline / table not migrated yet — keep payload timeline */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patient.id, updatePatient]);

  const displayVersions = useMemo(() => {
    if (!pendingVersion) return intakeVersions;
    if (intakeVersions.some((v) => v.id === pendingVersion.id)) return intakeVersions;
    return [...intakeVersions, pendingVersion];
  }, [intakeVersions, pendingVersion]);

  const isPendingTab = pendingVersion?.id === activeVersionId;
  const persistedLatestId = intakeVersions[intakeVersions.length - 1]?.id ?? '';
  const isLatestPersistedTab = activeVersionId === persistedLatestId && !isPendingTab;

  // Sync local state when persisted timeline changes (skip while a draft tab is open).
  useEffect(() => {
    if (pendingVersionIdRef.current) return;

    const sig = timelineSignature(resolvedTimeline);
    if (sig === timelineSigRef.current) return;
    timelineSigRef.current = sig;

    setIntakeVersions(resolvedTimeline);
    const latestId = getActiveVersionId(resolvedTimeline);
    setActiveVersionId((prev) => {
      if (keepActiveIdRef.current && resolvedTimeline.some((v) => v.id === keepActiveIdRef.current)) {
        const id = keepActiveIdRef.current;
        keepActiveIdRef.current = null;
        return id;
      }
      const editingLocally =
        localEditVersionIdRef.current != null && prev === localEditVersionIdRef.current;
      if (editingLocally && resolvedTimeline.some((v) => v.id === prev)) return prev;
      return latestId;
    });

    const targetId = keepActiveIdRef.current ?? latestId;
    const active =
      resolvedTimeline.find((v) => v.id === targetId) ??
      resolvedTimeline[resolvedTimeline.length - 1];
    if (active) {
      setDraftFields(versionFieldsSnapshot(active));
      localEditVersionIdRef.current = null;
    }
    keepActiveIdRef.current = null;
  }, [resolvedTimeline]);

  // When AI finishes, activate the draft tab once (do not reset on every field edit).
  useEffect(() => {
    if (!pendingVersion || !pendingFields) {
      pendingVersionIdRef.current = null;
      activatedPendingIdRef.current = null;
      return;
    }
    pendingVersionIdRef.current = pendingVersion.id;
    if (activatedPendingIdRef.current === pendingVersion.id) return;
    activatedPendingIdRef.current = pendingVersion.id;
    setActiveVersionId(pendingVersion.id);
    setDraftFields(pendingFields);
    localEditVersionIdRef.current = null;
  }, [pendingVersion, pendingFields]);

  // Bootstrap persisted timeline once (when payload has no timeline yet).
  useEffect(() => {
    if (bootstrapAttemptedRef.current) return;
    if ((patient.intakeVersionTimeline?.length ?? 0) > 0) {
      bootstrapAttemptedRef.current = true;
      return;
    }
    const bootstrap = buildBootstrapTimelinePatchIfNeeded(patient);
    if (!bootstrap) {
      bootstrapAttemptedRef.current = true;
      return;
    }
    bootstrapAttemptedRef.current = true;
    void onSaveTimelineRef.current(bootstrap);
  }, [patient.id, patient.intakeVersionTimeline]);

  const activeVersion = useMemo(
    () =>
      displayVersions.find((v) => v.id === activeVersionId) ??
      displayVersions[displayVersions.length - 1],
    [displayVersions, activeVersionId]
  );

  const isReadOnly =
    !isPendingTab &&
    (activeVersion?.immutable === true ||
      activeVersion?.kind === 'initial' ||
      activeVersionId !== persistedLatestId);

  const handleTabSelect = useCallback(
    (versionId: string) => {
      localEditVersionIdRef.current = null;
      setActiveVersionId(versionId);
      if (pendingVersion?.id === versionId && pendingFields) {
        setDraftFields(pendingFields);
        return;
      }
      const selected = intakeVersions.find((v) => v.id === versionId);
      if (selected) setDraftFields(versionFieldsSnapshot(selected));
    },
    [intakeVersions, pendingVersion?.id, pendingFields]
  );

  const handleFieldsChange = useCallback(
    (next: ClinicalIntakeEditableFields) => {
      if (isReadOnly) return;
      localEditVersionIdRef.current = activeVersionId;
      setDraftFields(next);
      if (isPendingTab) {
        onPendingFieldsChange?.(next);
        return;
      }
      setIntakeVersions((prev) =>
        prev.map((v) => (v.id === activeVersionId ? { ...v, fields: next } : v))
      );
    },
    [isReadOnly, activeVersionId, isPendingTab, onPendingFieldsChange]
  );

  const applySavedTimeline = useCallback((saved: UpsertIntakeVersionResult) => {
    keepActiveIdRef.current = saved.newVersion.id;
    timelineSigRef.current = timelineSignature(saved.timeline);
    setIntakeVersions(saved.timeline);
    setActiveVersionId(saved.newVersion.id);
    setDraftFields(versionFieldsSnapshot(saved.newVersion));
    localEditVersionIdRef.current = null;
  }, []);

  const handleSaveFields = useCallback(
    async (fields: ClinicalIntakeEditableFields) => {
      if (isReadOnly || isPendingTab) return;

      // Existing persisted tab → UPDATE row by UUID only.
      if (
        onUpdateIntakeVersion &&
        activeVersion &&
        isPersistedIntakeVersionId(activeVersionId)
      ) {
        const saved = await onUpdateIntakeVersion(activeVersionId, activeVersion, fields);
        if (saved) applySavedTimeline(saved);
        return;
      }

      // Legacy client id on latest tab — payload fallback only.
      const patch = buildPatchForLatestVersionSave(patient, fields, activeVersionId);
      await onSaveTimelineRef.current(patch);
      localEditVersionIdRef.current = null;
    },
    [
      isReadOnly,
      isPendingTab,
      onUpdateIntakeVersion,
      activeVersion,
      activeVersionId,
      patient,
      applySavedTimeline,
    ]
  );

  const handleComparative = useCallback(async () => {
    if (!onRunComparativeAnalysis || !draftFields || !isLatestPersistedTab || pendingVersion) return;
    await onRunComparativeAnalysis(draftFields);
  }, [onRunComparativeAnalysis, draftFields, isLatestPersistedTab, pendingVersion]);

  const handleConfirm = useCallback(async () => {
    if (!onConfirmPending || !draftFields || !pendingVersion) return;
    const saved = await onConfirmPending(draftFields);
    if (!saved) return;

    pendingVersionIdRef.current = null;
    activatedPendingIdRef.current = null;
    applySavedTimeline(saved);
  }, [onConfirmPending, draftFields, pendingVersion, applySavedTimeline]);

  const handleDiscardPending = useCallback(() => {
    pendingVersionIdRef.current = null;
    onDiscardPending?.();
    const latestId = getActiveVersionId(intakeVersions);
    setActiveVersionId(latestId);
    const active = intakeVersions[intakeVersions.length - 1];
    if (active) setDraftFields(versionFieldsSnapshot(active));
    localEditVersionIdRef.current = null;
  }, [onDiscardPending, intakeVersions]);

  const handleArchiveVersion = useCallback(
    async (versionId: string) => {
      const patch = buildPatchForArchiveIntakeVersion(patient, versionId);
      if (!patch) return;
      await onSaveTimelineRef.current(patch);
      localEditVersionIdRef.current = null;
    },
    [patient]
  );

  const handleAddSuccessiveVersion = useCallback(async () => {
    if (!onCreateSuccessiveVersion || pendingVersion || cloneBusy) return;
    const latest = intakeVersions[intakeVersions.length - 1];
    if (!latest) return;
    const saved = await onCreateSuccessiveVersion(latest);
    if (saved) applySavedTimeline(saved);
  }, [
    onCreateSuccessiveVersion,
    pendingVersion,
    cloneBusy,
    intakeVersions,
    applySavedTimeline,
  ]);

  if (!activeVersion || !draftFields) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">אין גרסאות אינטייק להצגה.</p>
    );
  }

  return (
    <div className={className} dir="rtl">
      <div
        className="flex overflow-x-auto border-b border-slate-200 bg-gradient-to-l from-slate-50 to-white rounded-t-xl scrollbar-thin"
        role="tablist"
        aria-label="ציר גרסאות אינטייק"
      >
        {displayVersions.map((version) => {
          const active = version.id === activeVersionId;
          const isDraft = pendingVersion?.id === version.id;
          const Icon = version.kind === 'initial' ? Archive : FileStack;
          return (
            <button
              key={version.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`intake-version-panel-${version.id}`}
              id={`intake-version-tab-${version.id}`}
              onClick={() => handleTabSelect(version.id)}
              className={`shrink-0 min-w-[7.5rem] px-4 py-3 text-start transition-all duration-200 border-b-2 ${
                active
                  ? isDraft
                    ? 'bg-violet-50 border-violet-600 text-violet-950'
                    : 'bg-white border-teal-600 text-teal-950'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70'
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? (isDraft ? 'text-violet-700' : 'text-teal-700') : 'text-slate-400'}`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-bold whitespace-nowrap ${active ? 'text-slate-900' : ''}`}
                  >
                    {formatIntakeVersionTabLabel(version)}
                    {isDraft && (
                      <span className="text-[10px] font-semibold text-violet-700 mr-1">(טיוטה)</span>
                    )}
                  </span>
                  <span className="block text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                    {version.kind === 'initial' ? 'קבלה ראשונית' : 'גרסה עוקבת'}
                  </span>
                </span>
              </span>
            </button>
          );
        })}

        {onCreateSuccessiveVersion && !pendingVersion && (
          <button
            type="button"
            onClick={() => void handleAddSuccessiveVersion()}
            disabled={cloneBusy || confirmBusy}
            aria-label="הוסף גרסת אינטייק חדשה"
            title="שכפל את הגרסה האחרונה וצור טאב חדש"
            className="shrink-0 flex items-center justify-center w-11 h-full min-h-[3.25rem] border-b-2 border-transparent text-teal-700 hover:bg-teal-50 hover:border-teal-400 disabled:opacity-40 transition-colors"
          >
            {cloneBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="w-5 h-5" aria-hidden />
            )}
          </button>
        )}
      </div>

      <div
        className="p-4 sm:p-5 bg-white rounded-b-xl border border-t-0 border-slate-200"
        role="tabpanel"
        id={`intake-version-panel-${activeVersionId}`}
        aria-labelledby={`intake-version-tab-${activeVersionId}`}
      >
        {isPendingTab && (
          <div className="rounded-xl border border-violet-300 bg-violet-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <p className="text-xs text-violet-950 leading-relaxed">
              <strong>גרסה חדשה — טיוטה.</strong> ערכו את השדות המובנים ולחצו אישור לשמירה קבועה
              בציר הגרסאות.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDiscardPending}
                disabled={confirmBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
                בטל
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={confirmBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40"
              >
                {confirmBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                )}
                אשר ושמור
              </button>
            </div>
          </div>
        )}

        {isReadOnly && !isPendingTab && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600 mb-4">
            <span className="font-bold text-slate-800">תצוגה היסטורית — </span>
            גרסה מ־{new Date(activeVersion.createdAt).toLocaleString('he-IL')}. לקריאה בלבד; הקבלה
            הראשונית לעולם לא נמחקת.
          </div>
        )}

        {isLatestPersistedTab && onRunComparativeAnalysis && !pendingVersion && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <p className="text-xs text-violet-950 leading-relaxed">
              ניתוח השוואתי יוצר <strong>גרסה חדשה</strong> בציר הזמן — עם מיפוי אוטומטי לשדות
              מובנים (סיפור, VAS, ROM, כוח, מסקנות).
            </p>
            <button
              type="button"
              onClick={() => void handleComparative()}
              disabled={comparativeBusy}
              className="inline-flex items-center gap-2 shrink-0 px-4 py-2 rounded-lg text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 disabled:opacity-40"
            >
              {comparativeBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="w-3.5 h-3.5" aria-hidden />
              )}
              ניתוח השוואתי
            </button>
          </div>
        )}

        {comparativeError && isLatestPersistedTab && !pendingVersion && (
          <p className="text-xs text-red-700 mb-4 whitespace-pre-wrap" role="alert">
            {comparativeError}
          </p>
        )}

        <IntakeVersionEditor
          key={activeVersionId}
          fields={draftFields}
          onFieldsChange={handleFieldsChange}
          onSave={handleSaveFields}
          readOnly={isReadOnly}
          compact={compact}
          showSaveButton={!isReadOnly && !isPendingTab}
          autoSave={!isReadOnly && !isPendingTab}
          comparativeMeta={activeVersion.comparativeMeta}
          sourceGemini={Boolean(activeVersion.comparativeMeta || activeVersion.medicalSchema)}
        />

        {isReadOnly && !isPendingTab && activeVersion.kind === 'analysis' && !activeVersion.immutable && (
          <div className="flex justify-end pt-2 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={() => void handleArchiveVersion(activeVersionId)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50"
              title="הסתר גרסה מהטאבים (נשמרת בארכיון)"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              ארכיון גרסה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
