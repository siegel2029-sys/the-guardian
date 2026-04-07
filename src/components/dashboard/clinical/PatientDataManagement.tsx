import { useState } from 'react';
import { Trash2, RotateCcw, MessageSquareOff, Activity, AlertTriangle } from 'lucide-react';
import { usePatient } from '../../../context/PatientContext';
import type { Patient } from '../../../types';

type DestructiveKind = 'delete' | 'plan' | 'messages' | 'pain';

const copy: Record<
  DestructiveKind,
  { label: string; step1Title: string; step1Body: string; step2Title: string; step2Body: string }
> = {
  delete: {
    label: 'מחיקת מטופל',
    step1Title: 'לאשר מחיקה?',
    step1Body: 'המטופל יוסר מהרשימה, יחד עם תוכנית התרגול, ההודעות והיסטוריית הדיווחים. חשבון הפורטל (מזהה PT) יימחק.',
    step2Title: 'פעולה בלתי הפיכה',
    step2Body: 'לא ניתן לשחזר נתונים לאחר מחיקה. האם להמשיך?',
  },
  plan: {
    label: 'איפוס תוכנית תרגול',
    step1Title: 'לאשר איפוס תוכנית?',
    step1Body: 'כל התרגילים במתכונת הנוכחית יוסרו מהמטופל. ניתן לבנות תוכנית מחדש.',
    step2Title: 'אישור סופי',
    step2Body: 'האיפוס הוא מיידי ונשמר ב-localStorage. לאשר שוב?',
  },
  messages: {
    label: 'איפוס היסטוריית הודעות',
    step1Title: 'לאשר מחיקת צ׳אט?',
    step1Body: 'כל ההודעות עם המטופל יימחקו לצמיתות מהמערכת (מטפל ומטופל).',
    step2Title: 'אישור סופי',
    step2Body: 'פעולה בלתי הפיכה. לאשר שוב?',
  },
  pain: {
    label: 'איפוס דוחות כאב',
    step1Title: 'לאשר איפוס דוחות כאב?',
    step1Body: 'כל רשומות ה-VAS והיסטוריית הכאב של המטופל יימחקו. סשני אימון יישארו.',
    step2Title: 'אישור סופי',
    step2Body: 'הנתונים לא ישוחזרו. לאשר שוב?',
  },
};

export default function PatientDataManagement({ patient }: { patient: Patient }) {
  const {
    isPatientSessionLocked,
    deletePatient,
    resetPatientExercisePlan,
    resetPatientMessageHistory,
    resetPatientPainReports,
  } = usePatient();

  const [open, setOpen] = useState<DestructiveKind | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  if (isPatientSessionLocked) return null;

  const start = (k: DestructiveKind) => {
    setOpen(k);
    setStep(1);
  };

  const close = () => {
    setOpen(null);
    setStep(1);
  };

  const run = () => {
    if (!open) return;
    if (open === 'delete') deletePatient(patient.id);
    else if (open === 'plan') resetPatientExercisePlan(patient.id);
    else if (open === 'messages') resetPatientMessageHistory(patient.id);
    else if (open === 'pain') resetPatientPainReports(patient.id);
    close();
  };

  const cfg = open ? copy[open] : null;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-5"
      dir="rtl"
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <h3 className="text-sm font-bold text-slate-800">ניהול נתונים ובטיחות (Double-Lock)</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        כל פעולה מחייבת שני אישורים רצופים למניעת מחיקה בטעות.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => start('plan')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="w-4 h-4" />
          איפוס תוכנית תרגול
        </button>
        <button
          type="button"
          onClick={() => start('messages')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <MessageSquareOff className="w-4 h-4" />
          איפוס הודעות
        </button>
        <button
          type="button"
          onClick={() => start('pain')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <Activity className="w-4 h-4" />
          איפוס דוחות כאב
        </button>
        <button
          type="button"
          onClick={() => start('delete')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border-2 border-red-300 text-red-800 bg-red-50 hover:bg-red-100"
        >
          <Trash2 className="w-4 h-4" />
          מחיקת מטופל
        </button>
      </div>

      {cfg && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dd-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-6 bg-white"
            style={{ borderColor: step === 2 ? '#f87171' : '#e2e8f0' }}
          >
            <p className="text-[10px] font-bold text-slate-400 mb-1">
              אישור {step}/2 — Double-Lock
            </p>
            <h2 id="dd-title" className="text-lg font-black text-slate-900 mb-2">
              {step === 1 ? cfg.step1Title : cfg.step2Title}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {step === 1 ? cfg.step1Body : cfg.step2Body}
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
              >
                ביטול
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #475569, #334155)' }}
                >
                  המשך לאישור שני
                </button>
              ) : (
                <button
                  type="button"
                  onClick={run}
                  className="px-4 py-2 rounded-xl text-sm font-black text-white"
                  style={{
                    background:
                      open === 'delete'
                        ? 'linear-gradient(135deg, #b91c1c, #7f1d1d)'
                        : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  }}
                >
                  אישור סופי — ביצוע
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
