import { useState } from 'react';
import { Bug } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';

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
            רמות 1–100 + נפח שריר (רק dev)
          </p>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
            onClick={() =>
              updatePatient(pid, {
                level: 5,
                xp: 0,
                xpForNextLevel: 500,
                currentStreak: 0,
              })
            }
          >
            רמה 5 — רזה / חלש
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-teal-900 text-teal-100 hover:bg-teal-800"
            onClick={() =>
              updatePatient(pid, {
                level: 35,
                xp: 1200,
                xpForNextLevel: 1800,
              })
            }
          >
            רמה 35 — שיקום פעיל
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-emerald-900 text-emerald-100 hover:bg-emerald-800"
            onClick={() =>
              updatePatient(pid, {
                level: 65,
                xp: 4000,
                xpForNextLevel: 9000,
              })
            }
          >
            רמה 65 — חיזוק
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-cyan-900 text-cyan-100 hover:bg-cyan-800"
            onClick={() =>
              updatePatient(pid, {
                level: 90,
                xp: 8000,
                xpForNextLevel: 16000,
              })
            }
          >
            רמה 90 — עוצמה
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-violet-950 text-violet-100 hover:bg-violet-900"
            onClick={() =>
              updatePatient(pid, {
                level: 100,
                xp: 0,
                xpForNextLevel: 999_999_999,
              })
            }
          >
            רמה 100 — מקסימום
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
