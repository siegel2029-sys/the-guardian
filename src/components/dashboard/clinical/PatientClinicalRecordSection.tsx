import { useState, useEffect, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { usePatient } from '../../../context/PatientContext';
import type { BodyArea, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { deriveDiagnosisHeadline } from '../../../utils/clinicalNarrative';
import { PortalDropdown } from '../../ui/PortalDropdown';

const ALL_AREAS_SORTED: BodyArea[] = (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
  bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
);

function PainAreasMultiSelect({
  selected,
  onToggle,
  onClear,
}: {
  selected: ReadonlySet<BodyArea>;
  onToggle: (area: BodyArea) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = selected.size;
  const summary = count === 0 ? 'בחרו אזורי כאב' : `${count} אזורים נבחרו`;

  // Stable close handler — passed to PortalDropdown which adds its own
  // scroll / resize / outside-click / Escape listeners.
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <div className="relative">
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/35"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate text-right flex-1">{summary}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Selected-area chips ── */}
      {count > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[...selected]
            .sort((a, b) => bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he'))
            .map((area) => (
              <span
                key={area}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-900/90 text-white text-xs font-semibold px-2 py-1"
              >
                {bodyAreaLabels[area]}
                <button
                  type="button"
                  onClick={() => onToggle(area)}
                  className="rounded p-0.5 hover:bg-white/20"
                  aria-label={`הסר ${bodyAreaLabels[area]}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
        </div>
      )}

      {/* ── Floating panel — PortalDropdown handles portal, positioning, and
           all dismissal logic (outside click, Escape, scroll reposition). ── */}
      <PortalDropdown
        open={open}
        onClose={handleClose}
        triggerRef={triggerRef as RefObject<HTMLElement | null>}
      >
        <div dir="rtl" role="listbox" aria-multiselectable className="py-1">
          <div className="flex justify-between items-center px-2 py-1.5 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-600">אזורי גוף</span>
            {count > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] font-bold text-red-700 hover:underline"
              >
                נקה הכל
              </button>
            )}
          </div>
          {ALL_AREAS_SORTED.map((area) => (
            <label
              key={area}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm text-slate-900"
            >
              <input
                type="checkbox"
                checked={selected.has(area)}
                onChange={() => onToggle(area)}
                className="rounded border-slate-400 text-teal-700 focus:ring-teal-600/40 shrink-0"
              />
              <span>{bodyAreaLabels[area]}</span>
            </label>
          ))}
        </div>
      </PortalDropdown>
    </div>
  );
}

export default function PatientClinicalRecordSection({ patient }: { patient: Patient }) {
  const {
    togglePatientInjuryHighlight,
    clearPatientInjuryHighlights,
    updatePatient,
    savePersistedStateToCloud,
  } = usePatient();

  const savedNarrative = (patient.geminiClinicalNarrative ?? patient.diagnosis ?? '').trim();
  const [narrativeDraft, setNarrativeDraft] = useState(savedNarrative);
  const [narrativeSaveBusy, setNarrativeSaveBusy] = useState(false);
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNarrativeDraft(savedNarrative);
  }, [patient.id, patient.geminiClinicalNarrative, patient.diagnosis]);

  const narrativeDirty = narrativeDraft.trim() !== savedNarrative;

  const scheduleCloudSave = useCallback(() => {
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = window.setTimeout(() => {
      cloudTimerRef.current = null;
      void savePersistedStateToCloud();
    }, 500);
  }, [savePersistedStateToCloud]);

  useEffect(() => {
    return () => {
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, []);

  const handleSaveNarrative = useCallback(async () => {
    setNarrativeSaveBusy(true);
    try {
      const trimmed = narrativeDraft.trim();
      updatePatient(patient.id, {
        geminiClinicalNarrative: trimmed,
        diagnosis: deriveDiagnosisHeadline(trimmed),
      });
      await savePersistedStateToCloud();
    } finally {
      setNarrativeSaveBusy(false);
    }
  }, [narrativeDraft, patient.id, updatePatient, savePersistedStateToCloud]);

  const handleToggleArea = useCallback(
    (area: BodyArea) => {
      togglePatientInjuryHighlight(patient.id, area);
      scheduleCloudSave();
    },
    [patient.id, togglePatientInjuryHighlight, scheduleCloudSave]
  );

  const injurySet = new Set(patient.injuryHighlightSegments ?? []);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5"
      dir="rtl"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-bold text-slate-950">תיעוד קליני</h2>
      </div>

      <div className="p-5 space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-950">אבחנה מקצועית (AI / עריכה)</h3>
          <textarea
            value={narrativeDraft}
            onChange={(e) => setNarrativeDraft(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-500"
            placeholder="הדביקו או ערכו כאן את הניתוח…"
            aria-label="אבחנה מקצועית"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!narrativeDirty || narrativeSaveBusy}
              onClick={() => void handleSaveNarrative()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              {narrativeSaveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              שמור
            </button>
            {narrativeDirty ? (
              <span className="text-xs text-amber-800 font-medium">יש שינויים שלא נשמרו</span>
            ) : null}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-950">אזורי כאב</h3>
          <p className="text-xs text-slate-600">הבחירה נשמרת אוטומטית בפרופיל המטופל.</p>
          <PainAreasMultiSelect
            selected={injurySet}
            onToggle={handleToggleArea}
            onClear={() => {
              clearPatientInjuryHighlights(patient.id);
              scheduleCloudSave();
            }}
          />
        </section>
      </div>
    </div>
  );
}
