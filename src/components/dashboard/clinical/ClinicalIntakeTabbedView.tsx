import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, FileStack, Loader2, Plus, Sparkles, X } from 'lucide-react';
import type { Patient, PatientIntakeVersionEntry } from '../../../types';
import type { ClinicalIntakeEditableFields } from '../../../utils/clinicalIntakeEditableFields';
import {
  buildBootstrapTimelinePatchIfNeeded,
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
    currentFields: ClinicalIntakeEditableFields,
    activeVersion: PatientIntakeVersionEntry,
    versionId: string
  ) => Promise<UpsertIntakeVersionResult | null>;
  comparativeBusy?: boolean;
  comparativeError?: string | null;
  onUpdateIntakeVersion?: (
    versionId: string,
    version: PatientIntakeVersionEntry,
    fields: ClinicalIntakeEditableFields
  ) => Promise<UpsertIntakeVersionResult | null>;
  onCreateSuccessiveVersion?: (
    sourceVersion: PatientIntakeVersionEntry
  ) => Promise<UpsertIntakeVersionResult | null>;
  onDeleteIntakeVersion?: (
    versionId: string,
    version: PatientIntakeVersionEntry
  ) => Promise<UpsertIntakeVersionResult | null>;
  cloneBusy?: boolean;
  deleteBusy?: boolean;
  updatePatient?: (id: string, patch: Partial<Patient>) => void;
  className?: string;
};

function versionFieldsSnapshot(v: PatientIntakeVersionEntry): ClinicalIntakeEditableFields {
  return JSON.parse(JSON.stringify(v.fields)) as ClinicalIntakeEditableFields;
}

function timelineSignature(timeline: PatientIntakeVersionEntry[]): string {
  return timeline.map((v) => `${v.id}:${v.createdAt}:${v.kind}`).join('|');
}

type IntakeVersionTabButtonProps = {
  version: PatientIntakeVersionEntry;
  index: number;
  active: boolean;
  canDelete: boolean;
  deleteBusy: boolean;
  onSelect: (versionId: string) => void;
  onDelete: (version: PatientIntakeVersionEntry, index: number) => void;
};

/** Browser-style intake tab with integrated close control (RTL trailing edge). */
function IntakeVersionTabButton({
  version,
  index,
  active,
  canDelete,
  deleteBusy,
  onSelect,
  onDelete,
}: IntakeVersionTabButtonProps) {
  const Icon = version.kind === 'initial' ? Archive : FileStack;
  const label = formatIntakeVersionTabLabel(version);
  const subtitle = version.kind === 'initial' ? 'קבלה ראשונית' : 'גרסה עוקבת';

  return (
    <div
      role="tab"
      tabIndex={active ? 0 : -1}
      aria-selected={active}
      aria-controls={`intake-version-panel-${version.id}`}
      id={`intake-version-tab-${version.id}`}
      onClick={() => onSelect(version.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(version.id);
        }
      }}
      className={`relative shrink-0 cursor-pointer select-none rounded-t-lg border transition-all duration-150 min-w-[7.5rem] max-w-[11rem] ${
        canDelete ? 'pt-5 ps-6 pe-3 pb-2.5' : 'px-3 py-2.5'
      } ${
        active
          ? 'z-10 -mb-px border-slate-200 border-b-white bg-white text-teal-950 shadow-sm'
          : 'border-transparent bg-slate-50/70 text-slate-500 hover:bg-white/90 hover:text-slate-800 hover:border-slate-200/80'
      }`}
    >
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(version, index);
          }}
          disabled={deleteBusy}
          aria-label={`מחק גרסה ${label}`}
          title="מחק גרסה"
          className="absolute top-1 start-1 z-20 flex h-4 w-4 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}

      <span className="flex items-center gap-1.5 min-w-0">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold leading-tight">{label}</span>
          <span className="block truncate text-[10px] text-slate-500 mt-0.5 leading-tight">
            {subtitle}
          </span>
        </span>
      </span>
    </div>
  );
}

export default function ClinicalIntakeTabbedView({
  patient,
  compact = false,
  onSaveTimeline,
  onRunComparativeAnalysis,
  comparativeBusy = false,
  comparativeError = null,
  onUpdateIntakeVersion,
  onCreateSuccessiveVersion,
  onDeleteIntakeVersion,
  cloneBusy = false,
  deleteBusy = false,
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
    const active = resolvedTimeline[0];
    return active ? versionFieldsSnapshot(active) : null;
  });

  const timelineSigRef = useRef(timelineSignature(resolvedTimeline));
  const bootstrapAttemptedRef = useRef(false);
  const localEditVersionIdRef = useRef<string | null>(null);
  const keepActiveIdRef = useRef<string | null>(null);
  const skipPayloadSyncRef = useRef(false);

  useEffect(() => {
    bootstrapAttemptedRef.current = false;
    timelineSigRef.current = '';
    localEditVersionIdRef.current = null;
    keepActiveIdRef.current = null;
    skipPayloadSyncRef.current = false;
  }, [patient.id]);

  useEffect(() => {
    if (!updatePatient) return;
    let cancelled = false;

    void (async () => {
      try {
        const timeline = await refreshIntakeVersionsFromDb(patient.id, patient, updatePatient);
        if (cancelled || timeline.length === 0) return;

        const sig = timelineSignature(timeline);
        if (sig === timelineSigRef.current) return;
        timelineSigRef.current = sig;
        setIntakeVersions(timeline);

        const latestId = getActiveVersionId(timeline);
        setActiveVersionId((prev) => (timeline.some((v) => v.id === prev) ? prev : latestId));

        const active = timeline.find((v) => v.id === latestId) ?? timeline[timeline.length - 1];
        if (active) setDraftFields(versionFieldsSnapshot(active));
      } catch {
        /* offline / table not migrated yet — keep payload timeline */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patient.id, updatePatient]);

  const persistedLatestId = intakeVersions[intakeVersions.length - 1]?.id ?? '';
  const isLatestPersistedTab = activeVersionId === persistedLatestId;

  useEffect(() => {
    if (skipPayloadSyncRef.current || comparativeBusy || cloneBusy || deleteBusy) return;

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
  }, [resolvedTimeline, comparativeBusy, cloneBusy, deleteBusy]);

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
      intakeVersions.find((v) => v.id === activeVersionId) ??
      intakeVersions[intakeVersions.length - 1],
    [intakeVersions, activeVersionId]
  );

  const isInitialTab = activeVersion?.kind === 'initial';
  const isAnalysisTab = activeVersion?.kind === 'analysis';
  const showComparativeCta =
    Boolean(onRunComparativeAnalysis) &&
    isAnalysisTab &&
    isLatestPersistedTab &&
    !isInitialTab;

  const isReadOnly =
    activeVersion?.immutable === true ||
    isInitialTab ||
    !isLatestPersistedTab;

  const handleTabSelect = useCallback(
    (versionId: string) => {
      localEditVersionIdRef.current = null;
      setActiveVersionId(versionId);
      const selected = intakeVersions.find((v) => v.id === versionId);
      if (selected) setDraftFields(versionFieldsSnapshot(selected));
    },
    [intakeVersions]
  );

  const handleFieldsChange = useCallback(
    (next: ClinicalIntakeEditableFields) => {
      if (isReadOnly) return;
      localEditVersionIdRef.current = activeVersionId;
      setDraftFields(next);
      setIntakeVersions((prev) =>
        prev.map((v) => (v.id === activeVersionId ? { ...v, fields: next } : v))
      );
    },
    [isReadOnly, activeVersionId]
  );

  /** After `+` — navigate to the newly inserted tab. */
  const applyNewVersionTimeline = useCallback((saved: UpsertIntakeVersionResult) => {
    skipPayloadSyncRef.current = true;
    keepActiveIdRef.current = saved.newVersion.id;
    timelineSigRef.current = timelineSignature(saved.timeline);
    setIntakeVersions(saved.timeline);
    setActiveVersionId(saved.newVersion.id);
    setDraftFields(versionFieldsSnapshot(saved.newVersion));
    localEditVersionIdRef.current = null;
    window.setTimeout(() => {
      skipPayloadSyncRef.current = false;
    }, 0);
  }, []);

  /** After comparative UPDATE — refresh fields on the same tab (no new tab). */
  const applyInPlaceVersionUpdate = useCallback(
    (saved: UpsertIntakeVersionResult, preserveVersionId: string) => {
      skipPayloadSyncRef.current = true;
      timelineSigRef.current = timelineSignature(saved.timeline);
      setIntakeVersions(saved.timeline);
      setActiveVersionId(preserveVersionId);
      const updated =
        saved.timeline.find((v) => v.id === preserveVersionId) ?? saved.newVersion;
      setDraftFields(versionFieldsSnapshot(updated));
      localEditVersionIdRef.current = null;
      window.setTimeout(() => {
        skipPayloadSyncRef.current = false;
      }, 0);
    },
    []
  );

  const applyDeletedVersion = useCallback(
    (saved: UpsertIntakeVersionResult, deletedIndex: number) => {
      skipPayloadSyncRef.current = true;
      timelineSigRef.current = timelineSignature(saved.timeline);
      setIntakeVersions(saved.timeline);
      const fallbackIdx = Math.max(0, deletedIndex - 1);
      const fallback = saved.timeline[fallbackIdx] ?? saved.newVersion;
      setActiveVersionId(fallback.id);
      setDraftFields(versionFieldsSnapshot(fallback));
      localEditVersionIdRef.current = null;
      window.setTimeout(() => {
        skipPayloadSyncRef.current = false;
      }, 0);
    },
    []
  );

  const handleSaveFields = useCallback(
    async (fields: ClinicalIntakeEditableFields) => {
      if (isReadOnly) return;

      if (
        onUpdateIntakeVersion &&
        activeVersion &&
        isPersistedIntakeVersionId(activeVersionId)
      ) {
        const saved = await onUpdateIntakeVersion(activeVersionId, activeVersion, fields);
        if (saved) applyInPlaceVersionUpdate(saved, activeVersionId);
        return;
      }

      const patch = buildPatchForLatestVersionSave(patient, fields, activeVersionId);
      await onSaveTimelineRef.current(patch);
      localEditVersionIdRef.current = null;
    },
    [
      isReadOnly,
      onUpdateIntakeVersion,
      activeVersion,
      activeVersionId,
      patient,
      applyInPlaceVersionUpdate,
    ]
  );

  const handleComparative = useCallback(async () => {
    if (!onRunComparativeAnalysis || !draftFields || !activeVersion || !showComparativeCta) return;
    const preserveId = activeVersionId;
    const saved = await onRunComparativeAnalysis(draftFields, activeVersion, preserveId);
    if (saved) applyInPlaceVersionUpdate(saved, preserveId);
  }, [
    onRunComparativeAnalysis,
    draftFields,
    activeVersion,
    activeVersionId,
    showComparativeCta,
    applyInPlaceVersionUpdate,
  ]);

  const handleDeleteVersion = useCallback(
    async (version: PatientIntakeVersionEntry, index: number) => {
      if (!onDeleteIntakeVersion || version.kind === 'initial' || version.immutable || index === 0) {
        return;
      }
      const label = formatIntakeVersionTabLabel(version);
      const ok = window.confirm(`למחוק את הגרסה «${label}»? פעולה זו אינה ניתנת לביטול.`);
      if (!ok) return;
      const saved = await onDeleteIntakeVersion(version.id, version);
      if (saved) applyDeletedVersion(saved, index);
    },
    [onDeleteIntakeVersion, applyDeletedVersion]
  );

  const handleAddSuccessiveVersion = useCallback(async () => {
    if (!onCreateSuccessiveVersion || cloneBusy) return;
    const source = intakeVersions[intakeVersions.length - 1];
    if (!source) return;
    const saved = await onCreateSuccessiveVersion(source);
    if (saved) applyNewVersionTimeline(saved);
  }, [onCreateSuccessiveVersion, cloneBusy, intakeVersions, applyNewVersionTimeline]);

  if (!activeVersion || !draftFields) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">אין גרסאות אינטייק להצגה.</p>
    );
  }

  return (
    <div className={className} dir="rtl">
      <div
        className="flex flex-row items-end gap-1 sm:gap-2 px-2 pt-2 overflow-x-auto border-b border-slate-200 bg-slate-100/60 rounded-t-xl scrollbar-thin"
        role="tablist"
        aria-label="ציר גרסאות אינטייק"
      >
        {intakeVersions.map((version, index) => {
          const active = version.id === activeVersionId;
          const canDelete = Boolean(
            onDeleteIntakeVersion &&
              index > 0 &&
              version.kind !== 'initial' &&
              !version.immutable
          );
          return (
            <IntakeVersionTabButton
              key={version.id}
              version={version}
              index={index}
              active={active}
              canDelete={canDelete}
              deleteBusy={deleteBusy}
              onSelect={handleTabSelect}
              onDelete={(v, i) => void handleDeleteVersion(v, i)}
            />
          );
        })}

        {onCreateSuccessiveVersion && (
          <button
            type="button"
            onClick={() => void handleAddSuccessiveVersion()}
            disabled={cloneBusy}
            aria-label="הוסף גרסת אינטייק חדשה"
            title="צור גרסה חדשה — שכפול מהטאב האחרון"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 mb-1 rounded-md border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-white hover:text-teal-700 disabled:opacity-40"
          >
            {cloneBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="w-4 h-4" aria-hidden />
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
        {isReadOnly && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600 mb-4">
            <span className="font-bold text-slate-800">תצוגה לקריאה בלבד — </span>
            {isInitialTab
              ? 'קבלה ראשונית אינה ניתנת לעריכה.'
              : `גרסה מ־${new Date(activeVersion.createdAt).toLocaleString('he-IL')}.`}
          </div>
        )}

        {showComparativeCta && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <p className="text-xs text-violet-950 leading-relaxed">
              ניתוח השוואתי ממלא אוטומטית את השדות בגרסה זו (סיפור, VAS, ROM, כוח, מסקנות)
              — ללא יצירת טאבים נוספים.
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

        {comparativeError && showComparativeCta && (
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
          showSaveButton={!isReadOnly}
          autoSave={!isReadOnly}
          comparativeMeta={activeVersion.comparativeMeta}
          sourceGemini={Boolean(activeVersion.comparativeMeta || activeVersion.medicalSchema)}
        />

      </div>
    </div>
  );
}
