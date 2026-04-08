import { useState } from 'react';
import { Bug } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { ExerciseLevel } from '../../types';

/**
 * פאנל דיבוג ויזואלי — רק ב־development (מוצג מההורה).
 */
export default function PortalPatientDebugPanel() {
  const { selectedPatient, updatePatient } = usePatient();
  const [open, setOpen] = useState(false);

  if (!selectedPatient) return null;

  const pid = selectedPatient.id;

  return (
    <div
      className="fixed z-[60] text-start"
      style={{ left: 8, bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', maxWidth: 200 }}
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-bold border shadow-md"
        style={{
          background: 'rgba(15,23,42,0.88)',
          borderColor: '#475569',
          color: '#e2e8f0',
        }}
      >
        <Bug className="w-3.5 h-3.5" />
        דיבוג
      </button>
      {open && (
        <div
          className="mt-2 rounded-xl border p-2.5 space-y-1.5 shadow-xl"
          style={{
            background: 'rgba(15,23,42,0.95)',
            borderColor: '#64748b',
          }}
        >
          <p className="text-[9px] text-slate-400 leading-snug mb-1">
            אבולוציית שריר (רק dev) + חנות
          </p>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
            onClick={() =>
              updatePatient(pid, {
                level: 2 as ExerciseLevel,
                xp: 0,
                xpForNextLevel: 500,
                currentStreak: 0,
              })
            }
          >
            רמה 2 — רזה / חלש
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-teal-900 text-teal-100 hover:bg-teal-800"
            onClick={() =>
              updatePatient(pid, {
                level: 5 as ExerciseLevel,
                xp: 2000,
                xpForNextLevel: 2500,
              })
            }
          >
            רמה 5 — מוגדר / פעיל
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-cyan-900 text-cyan-100 hover:bg-cyan-800"
            onClick={() =>
              updatePatient(pid, {
                level: 10 as ExerciseLevel,
                xp: 5000,
                xpForNextLevel: 8000,
              })
            }
          >
            רמה 10 — חזק / עוצמה
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-amber-900 text-amber-100 hover:bg-amber-800"
            onClick={() =>
              updatePatient(pid, {
                coins: selectedPatient.coins + 1000,
              })
            }
          >
            Rich Mode (+1000 מטבעות)
          </button>
        </div>
      )}
    </div>
  );
}
