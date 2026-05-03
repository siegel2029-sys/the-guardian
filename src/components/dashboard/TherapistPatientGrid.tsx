import { ClipboardList, Activity, AlertCircle } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import type { Patient } from '../../types';

type BadgeKind = 'active_today' | 'needs_plan' | 'high_pain';

function badgesForPatient(
  p: Patient,
  clinicalToday: string,
  dayMap: Record<string, { exercisesCompleted?: number }> | undefined,
  exerciseCount: number
): { kind: BadgeKind; label: string; className: string }[] {
  const out: { kind: BadgeKind; label: string; className: string }[] = [];
  const todayDone = (dayMap?.[clinicalToday]?.exercisesCompleted ?? 0) > 0;
  if (todayDone) {
    out.push({
      kind: 'active_today',
      label: 'פעיל היום',
      className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    });
  }
  if (exerciseCount === 0 || p.status === 'pending') {
    out.push({
      kind: 'needs_plan',
      label: 'נדרש עדכון תוכנית',
      className: 'bg-amber-50 text-amber-950 border-amber-300',
    });
  }
  const lastPain = p.analytics.painHistory.slice(-1)[0]?.painLevel;
  if (p.hasRedFlag || (lastPain != null && lastPain >= 7)) {
    out.push({
      kind: 'high_pain',
      label: 'דווח כאב משמעותי',
      className: 'bg-red-50 text-red-900 border-red-200',
    });
  }
  return out;
}

export default function TherapistPatientGrid() {
  const {
    patients,
    selectedPatient,
    selectPatient,
    clinicalToday,
    dailyHistoryByPatient,
    getExercisePlan,
  } = usePatient();

  if (patients.length === 0) return null;

  return (
    <section className="mb-6" dir="rtl">
      <div className="flex items-end justify-between gap-2 mb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">מטופלים</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            בחירה מהירה וסטטוס קליני תמציתי
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-400 tabular-nums">
          {patients.length} ברשימה
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {patients.map((p) => {
          const selected = p.id === selectedPatient?.id;
          const plan = getExercisePlan(p.id);
          const n = plan?.exercises.length ?? 0;
          const dayMap = dailyHistoryByPatient[p.id];
          const badgeList = badgesForPatient(p, clinicalToday, dayMap, n);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPatient(p.id)}
              className={`text-start rounded-2xl border-2 p-4 transition-all shadow-sm hover:shadow-md active:scale-[0.99] min-h-[80px] ${
                selected
                  ? 'border-teal-500 bg-gradient-to-br from-teal-50/90 to-white ring-2 ring-teal-200/60'
                  : 'border-slate-200 bg-white hover:border-teal-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-black shrink-0 shadow-inner"
                  style={{
                    background: selected
                      ? 'linear-gradient(135deg, #0d9488, #059669)'
                      : 'linear-gradient(135deg, #64748b, #94a3b8)',
                  }}
                >
                  {getPatientDisplayName(p).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{getPatientDisplayName(p)}</p>
                  <p className="text-xs text-slate-600 truncate mt-0.5">{p.diagnosis}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      {n} בתוכנית
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      רמה {p.level}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {badgeList.length === 0 ? (
                  <span className="text-[10px] font-medium px-2 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-200">
                    ללא דגל סטטוס
                  </span>
                ) : (
                  badgeList.map((b) => (
                    <span
                      key={b.kind}
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${b.className}`}
                    >
                      {b.kind === 'high_pain' && (
                        <AlertCircle className="w-3 h-3 shrink-0" aria-hidden />
                      )}
                      {b.label}
                    </span>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
