import { useMemo, useState } from 'react';
import { ClipboardList, Activity, AlertCircle, CalendarDays, Search } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import type { Patient } from '../../types';

type BadgeKind = 'active_today' | 'needs_plan' | 'high_pain';

const statusLabels: Record<string, string> = {
  active: 'פעיל',
  pending: 'ממתין',
  paused: 'מושהה',
};

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

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Patient['status']>('all');

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const name = getPatientDisplayName(p).toLowerCase();
      const dx = (p.diagnosis ?? '').toLowerCase();
      return name.includes(q) || dx.includes(q);
    });
  }, [patients, search, statusFilter]);

  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-5" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">מטופלים</h2>
          <p className="text-sm text-gray-500 mt-0.5">בחירה מהירה וסטטוס קליני תמציתי</p>
        </div>
        <span className="text-sm text-gray-500 tabular-nums shrink-0">
          {filteredPatients.length}/{patients.length} ברשימה
        </span>
      </div>

      {patients.length > 0 && (
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center mb-4">
          <label className="relative flex-1 min-w-0 md:min-w-[200px] md:max-w-md">
            <span className="sr-only">חיפוש מטופלים</span>
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או אבחנה…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-10 pl-3 text-sm text-slate-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full md:w-44 rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            aria-label="סינון לפי סטטוס"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="pending">ממתין</option>
            <option value="paused">מושהה</option>
          </select>
        </div>
      )}

      {patients.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">אין מטופלים ברשימה — הוסיפו מטופל חדש מהכפתור למעלה.</p>
      ) : filteredPatients.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">אין תוצאות לחיפוש או לסינון הנוכחי.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPatients.map((p) => {
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
                className={`text-start rounded-xl border p-4 transition-shadow min-h-[72px] min-w-0 ${
                  selected
                    ? 'border-teal-500 bg-teal-50/60 shadow-md ring-2 ring-teal-200/50'
                    : 'border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0 ${
                      selected ? 'bg-teal-600' : 'bg-slate-500'
                    }`}
                  >
                    {getPatientDisplayName(p).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-900 truncate">{getPatientDisplayName(p)}</p>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${
                          p.status === 'active'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : p.status === 'pending'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-slate-50 text-slate-700 border-gray-200'
                        }`}
                      >
                        {statusLabels[p.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-1">{p.diagnosis}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        {n} בתוכנית
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 shrink-0" />
                        רמה {p.level}
                      </span>
                      <span className="hidden md:inline-flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                        הצטרף {new Date(p.joinDate).toLocaleDateString('he-IL')}
                      </span>
                      <span className="hidden lg:inline-flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                        אחרון {new Date(p.lastSessionDate).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {badgeList.length === 0 ? (
                    <span className="hidden md:inline-flex text-xs font-medium px-2 py-1 rounded-lg bg-gray-50 text-gray-500 border border-gray-100">
                      ללא דגל סטטוס
                    </span>
                  ) : (
                    badgeList.map((b) => (
                      <span
                        key={b.kind}
                        className={`${b.kind === 'active_today' ? 'hidden md:inline-flex' : 'inline-flex'} items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border ${b.className}`}
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
      )}
    </section>
  );
}
