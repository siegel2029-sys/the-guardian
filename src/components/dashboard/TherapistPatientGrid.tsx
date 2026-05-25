import { useMemo, useState } from 'react';
import { ClipboardList, Activity, Search } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import {
  formatPatientLastClinicalActivityHe,
  patientLastVisitValueParts,
  patientMatchesRosterSearch,
  patientRosterStatusBadge,
} from '../../utils/patientPortalMeta';
import type { Patient } from '../../types';

export type RosterFilterKey = 'total' | 'active' | 'pending' | 'redFlags' | 'paused';

function rosterAvatarLabel(p: Patient): string {
  const name = getPatientDisplayName(p).trim();
  if (name.length <= 4) return name;
  return name.slice(0, 2).toUpperCase();
}

function selectValueFromFilterKey(key: RosterFilterKey): string {
  if (key === 'total') return 'all';
  if (key === 'redFlags') return 'red_flags';
  return key;
}

function filterKeyFromSelect(v: string): RosterFilterKey {
  if (v === 'all') return 'total';
  if (v === 'red_flags') return 'redFlags';
  return v as RosterFilterKey;
}

export type TherapistPatientGridProps = {
  rosterFilterKey: RosterFilterKey;
  onRosterFilterKeyChange: (key: RosterFilterKey) => void;
};

export default function TherapistPatientGrid({
  rosterFilterKey,
  onRosterFilterKeyChange,
}: TherapistPatientGridProps) {
  const {
    patients,
    selectedPatient,
    selectPatient,
    clinicalToday,
    getExercisePlan,
  } = usePatient();

  const [search, setSearch] = useState('');

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      switch (rosterFilterKey) {
        case 'active':
          if (p.status !== 'active') return false;
          break;
        case 'pending':
          if (p.status !== 'pending') return false;
          break;
        case 'paused':
          if (p.status !== 'paused') return false;
          break;
        case 'redFlags':
          if (!p.hasRedFlag) return false;
          break;
        default:
          break;
      }
      if (!q) return true;
      const name = getPatientDisplayName(p);
      return patientMatchesRosterSearch(p, q, name);
    });
  }, [patients, search, rosterFilterKey]);

  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-5" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">מטופלים</h2>
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
              placeholder="חיפוש לפי שם או אזור..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-10 pl-3 text-sm text-slate-900 placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <select
            value={selectValueFromFilterKey(rosterFilterKey)}
            onChange={(e) => onRosterFilterKeyChange(filterKeyFromSelect(e.target.value))}
            className="w-full md:w-auto md:min-w-[11rem] rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            aria-label="סינון לפי סטטוס"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="pending">ממתין</option>
            <option value="paused">מושהה</option>
            <option value="red_flags">דגלים אדומים</option>
          </select>
        </div>
      )}

      {patients.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">אין מטופלים ברשימה — הוסיפו מטופל חדש מסרגל הצד.</p>
      ) : filteredPatients.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">אין תוצאות לחיפוש או לסינון הנוכחי.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPatients.map((p) => {
            const selected = p.id === selectedPatient?.id;
            const plan = getExercisePlan(p.id);
            const n = plan?.exercises.length ?? 0;
            const statusBadge = patientRosterStatusBadge(p);
            const lastVisit = formatPatientLastClinicalActivityHe(p, clinicalToday);
            const visitValueParts = patientLastVisitValueParts(lastVisit);

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p.id)}
                aria-label={getPatientDisplayName(p)}
                className={`text-start rounded-xl border p-4 transition-shadow min-w-0 ${
                  selected
                    ? 'border-teal-500 bg-teal-50/60 shadow-md ring-2 ring-teal-200/50'
                    : 'border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-[3.75rem] h-[3.75rem] rounded-full flex items-center justify-center shrink-0 text-center px-1 ${
                      selected
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-400 text-white'
                    }`}
                    aria-hidden
                  >
                    <span className="text-sm font-black leading-tight break-all">
                      {rosterAvatarLabel(p)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {statusBadge && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border mb-2 ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </span>
                    )}

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                        {n} בתוכנית
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        רמה {p.level}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-snug text-slate-800">
                      <span>ביקור אחרון: </span>
                      {visitValueParts.map((part, i) => (
                        <span key={i} className={part.className}>
                          {part.text}
                        </span>
                      ))}
                    </p>

                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      הצטרף:{' '}
                      {new Date(p.joinDate).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
