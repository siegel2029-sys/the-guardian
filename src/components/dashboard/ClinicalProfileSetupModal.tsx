import { useMemo, useState } from 'react';
import { X, Stethoscope, Dumbbell } from 'lucide-react';
import { EXERCISE_LIBRARY } from '../../data/mockData';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { exerciseMatchesPrimary } from '../../utils/clinicalBodyArea';

const ALL_AREAS = Object.keys(bodyAreaLabels) as BodyArea[];

type Props = {
  patientName: string;
  onClose: () => void;
  onSave: (primaryBodyArea: BodyArea, libraryExerciseIds: string[]) => void;
};

export default function ClinicalProfileSetupModal({ patientName, onClose, onSave }: Props) {
  const [primary, setPrimary] = useState<BodyArea>('knee_right');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const suggested = useMemo(
    () => EXERCISE_LIBRARY.filter((ex) => exerciseMatchesPrimary(ex, primary)),
    [primary]
  );

  const toggleLibId = (libId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(libId)) next.delete(libId);
      else next.add(libId);
      return next;
    });
  };

  const selectAllSuggested = () => {
    setSelected(new Set(suggested.map((e) => e.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const submit = () => {
    if (selected.size === 0) return;
    onSave(primary, [...selected]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl border border-teal-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinical-setup-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-teal-100 shrink-0">
          <h2 id="clinical-setup-title" className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            פרופיל קליני — {patientName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">אזור גוף מרכזי (מפת גוף + תרגילים)</label>
            <select
              value={primary}
              onChange={(e) => {
                setPrimary(e.target.value as BodyArea);
                setSelected(new Set());
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800"
            >
              {ALL_AREAS.map((a) => (
                <option key={a} value={a}>
                  {bodyAreaLabels[a]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              הבחירה מעדכנת את אזור המיקוד במפת הגוף של המטופל ובוחרת תרגילים רלוונטיים מהספרייה.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-teal-600" />
                תוכנית התחלתית ({suggested.length} תרגילים מוצעים)
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={selectAllSuggested}
                  className="text-[11px] font-medium text-teal-700 hover:underline"
                >
                  בחר הכל
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] font-medium text-slate-500 hover:underline"
                >
                  נקה
                </button>
              </div>
            </div>
            <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {suggested.map((ex) => {
                const on = selected.has(ex.id);
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() => toggleLibId(ex.id)}
                      className={`w-full text-right px-3 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                        on ? 'bg-teal-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px] font-bold ${
                          on ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-800 block">{ex.name}</span>
                        <span className="text-[11px] text-slate-500">
                          {ex.muscleGroup} · {bodyAreaLabels[ex.targetArea]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {suggested.length === 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                אין תרגילים בספרייה לאזור זה — בחרו אזור אחר.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-teal-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={submit}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-45"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            שמירה והפעלה
          </button>
        </div>
      </div>
    </div>
  );
}
