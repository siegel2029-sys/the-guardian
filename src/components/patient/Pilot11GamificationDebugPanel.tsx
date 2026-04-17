import { useCallback, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Sparkles } from 'lucide-react';
import type { Patient } from '../../types';
import { usePatient } from '../../context/PatientContext';
import { clampPatientLevel } from '../../body/patientLevelXp';
import { addDevCalendarOffsetDays, getDevCalendarOffsetDays } from '../../utils/debugMockDate';
import {
  PILOT11_GUARDI_DEBUG_EVENT,
  type Pilot11GuardiDebugDetail,
} from '../../utils/pilot11GuardiDebugEvents';
import { isPilot11GamificationDebugPatient } from '../../utils/pilot11GamificationDebug';

type UndoSnap = {
  patient: Patient;
  calendarOffset: number;
};

function patientToPatch(p: Patient): Partial<Omit<Patient, 'id' | 'therapistId'>> {
  const { id: _id, therapistId: _tid, ...rest } = p;
  return rest;
}

function dispatchGuardi(detail: Pilot11GuardiDebugDetail) {
  window.dispatchEvent(new CustomEvent(PILOT11_GUARDI_DEBUG_EVENT, { detail }));
}

/**
 * פאנל דיבאג גמיפיקציה — רק למטופל עם מזהה או שם `pilot11`.
 */
export default function Pilot11GamificationDebugPanel() {
  const {
    selectedPatient,
    updatePatient,
    resetPatientToCleanAvatar,
    devSkipToNextCalendarDay,
    devSkipToPreviousCalendarDay,
    clinicalToday,
  } = usePatient();

  const [expanded, setExpanded] = useState(false);
  const undoStack = useRef<UndoSnap[]>([]);

  const pushUndo = useCallback(() => {
    if (!selectedPatient) return;
    undoStack.current.push({
      patient: JSON.parse(JSON.stringify(selectedPatient)) as Patient,
      calendarOffset: getDevCalendarOffsetDays(),
    });
    if (undoStack.current.length > 30) undoStack.current.shift();
  }, [selectedPatient]);

  const handleUndo = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap || !selectedPatient) return;
    updatePatient(selectedPatient.id, patientToPatch(snap.patient));
    const delta = snap.calendarOffset - getDevCalendarOffsetDays();
    if (delta !== 0) addDevCalendarOffsetDays(delta, { allowInProd: true });
  }, [selectedPatient, updatePatient]);

  if (!selectedPatient || !isPilot11GamificationDebugPatient(selectedPatient)) return null;

  const pid = selectedPatient.id;

  const run = (fn: () => void) => {
    pushUndo();
    fn();
  };

  return (
    <div
      className="fixed z-[58] text-start pointer-events-none"
      style={{
        left: 8,
        right: 8,
        bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
        maxWidth: 360,
      }}
      dir="rtl"
    >
      <div className="pointer-events-auto rounded-2xl border border-white/20 bg-slate-950/72 backdrop-blur-md shadow-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-slate-100 hover:bg-white/5"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-hidden />
            <span className="truncate">pilot11 — בקרת גמיפיקציה</span>
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" />
          )}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2.5 border-t border-white/10 pt-2 max-h-[min(52vh,420px)] overflow-y-auto">
            <p className="text-[9px] text-slate-400 leading-snug tabular-nums" dir="ltr">
              clinicalToday: <span className="text-emerald-300/95">{clinicalToday}</span> · offset{' '}
              {getDevCalendarOffsetDays()}
            </p>

            <div className="flex flex-wrap gap-1">
              <span className="text-[9px] font-bold text-slate-500 w-full">זמן</span>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-800/90 text-slate-100 border border-slate-600/60"
                onClick={() => run(() => devSkipToPreviousCalendarDay(pid))}
              >
                יום אחורה
              </button>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-900/80 text-violet-50 border border-violet-600/50"
                onClick={() => run(() => devSkipToNextCalendarDay(pid))}
              >
                יום קדימה
              </button>
            </div>

            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-bold text-slate-500 w-full">רמה</span>
              <button
                type="button"
                className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-800 text-slate-100 border border-slate-600/60"
                onClick={() =>
                  run(() => {
                    const L = Math.max(1, selectedPatient.level - 1);
                    updatePatient(pid, { level: clampPatientLevel(L) as Patient['level'] });
                  })
                }
              >
                −
              </button>
              <span className="text-[10px] font-bold text-slate-300 tabular-nums px-1">
                {selectedPatient.level}
              </span>
              <button
                type="button"
                className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-800 text-slate-100 border border-slate-600/60"
                onClick={() =>
                  run(() => {
                    const L = Math.min(100, selectedPatient.level + 1);
                    updatePatient(pid, { level: clampPatientLevel(L) as Patient['level'] });
                  })
                }
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-bold text-slate-500 w-full">מטבעות</span>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-950/80 text-amber-100 border border-amber-700/40"
                onClick={() =>
                  run(() =>
                    updatePatient(pid, { coins: Math.max(0, selectedPatient.coins - 10) })
                  )
                }
              >
                −10
              </button>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-950/80 text-amber-100 border border-amber-700/40"
                onClick={() =>
                  run(() =>
                    updatePatient(pid, { coins: Math.max(0, selectedPatient.coins - 50) })
                  )
                }
              >
                −50
              </button>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-950/80 text-emerald-50 border border-emerald-700/40"
                onClick={() => run(() => updatePatient(pid, { coins: selectedPatient.coins + 10 }))}
              >
                +10
              </button>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-950/80 text-emerald-50 border border-emerald-700/40"
                onClick={() => run(() => updatePatient(pid, { coins: selectedPatient.coins + 50 }))}
              >
                +50
              </button>
              <span className="text-[10px] text-slate-400 tabular-nums ms-1">= {selectedPatient.coins}</span>
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-rose-900/75 text-rose-50 border border-rose-700/50"
                onClick={() => run(() => resetPatientToCleanAvatar(pid))}
              >
                איפוס נתונים
              </button>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-800 text-slate-100 border border-slate-600/60 flex items-center gap-1"
                onClick={handleUndo}
              >
                <RotateCcw className="w-3 h-3" aria-hidden />
                בטל פעולה
              </button>
            </div>

            <div>
              <p className="text-[9px] font-bold text-slate-500 mb-1">
                גארדי — הקשר (תמונה + טקסט מסונכרנים)
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-800/90 text-slate-100 border border-slate-600/60"
                  onClick={() => dispatchGuardi({ action: 'semantic', kind: 'welcome' })}
                >
                  welcome
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-indigo-900/70 text-indigo-50 border border-indigo-700/40"
                  onClick={() => dispatchGuardi({ action: 'semantic', kind: 'learning' })}
                >
                  learning
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-sky-900/70 text-sky-50 border border-sky-700/40"
                  onClick={() => dispatchGuardi({ action: 'semantic', kind: 'success' })}
                >
                  success
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-950/70 text-amber-50 border border-amber-700/40"
                  onClick={() => dispatchGuardi({ action: 'semantic', kind: 'pain' })}
                >
                  pain
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-orange-950/70 text-orange-50 border border-orange-700/40"
                  onClick={() => dispatchGuardi({ action: 'semantic', kind: 'pain_intense' })}
                >
                  pain+
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-900/70 text-violet-50 border border-violet-700/40"
                  onClick={() => dispatchGuardi({ action: 'semantic', kind: 'strength' })}
                >
                  strength
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-fuchsia-900/65 text-fuchsia-50 border border-fuchsia-700/35"
                  onClick={() =>
                    dispatchGuardi({
                      action: 'ambient',
                      line: 'טקסט מותאם אישית לבדיקת רקע (יוגה / נוף)',
                    })
                  }
                >
                  רקע מותאם
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-600/50"
                  onClick={() => {
                    dispatchGuardi({ action: 'ambient', line: null });
                  }}
                >
                  נקה בועה
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
