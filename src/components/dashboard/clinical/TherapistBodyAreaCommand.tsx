import { useMemo, useCallback } from 'react';
import BodyMap3D from '../../body-map/BodyMap3D';
import type {
  BodyArea,
  ManualClinicalSegmentLockOverride,
  Patient,
} from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';

type LockUi = 'auto' | 'force_locked' | 'force_unlocked';

function lockFromPatient(
  overrides: Partial<Record<BodyArea, ManualClinicalSegmentLockOverride>> | undefined,
  area: BodyArea
): LockUi {
  const v = overrides?.[area];
  if (v === 'force_locked') return 'force_locked';
  if (v === 'force_unlocked') return 'force_unlocked';
  return 'auto';
}

export default function TherapistBodyAreaCommand({ patient }: { patient: Patient }) {
  const {
    getExercisePlan,
    updatePatient,
    savePersistedStateToCloud,
    togglePatientInjuryHighlight,
    cycleTherapistBodyMapClinical,
  } = usePatient();

  const plan = getExercisePlan(patient.id);
  const activeAreas = useMemo(() => {
    if (!plan?.exercises.length) return [patient.primaryBodyArea];
    return [...new Set(plan.exercises.map((e) => e.targetArea))];
  }, [plan, patient.primaryBodyArea]);

  const sortedAreas = useMemo(
    () =>
      (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
        bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
      ),
    []
  );

  const persistPatch = useCallback(
    (patch: Partial<Patient>) => {
      updatePatient(patient.id, patch);
      void savePersistedStateToCloud();
    },
    [patient.id, updatePatient, savePersistedStateToCloud]
  );

  const onMapClick = useCallback(
    (area: BodyArea) => {
      cycleTherapistBodyMapClinical(patient.id, area);
      void savePersistedStateToCloud();
    },
    [patient.id, cycleTherapistBodyMapClinical, savePersistedStateToCloud]
  );

  const toggleSecondary = useCallback(
    (area: BodyArea) => {
      const sec = [...(patient.secondaryClinicalBodyAreas ?? [])];
      const next = sec.includes(area) ? sec.filter((a) => a !== area) : [...sec, area];
      persistPatch({ secondaryClinicalBodyAreas: next });
    },
    [patient.secondaryClinicalBodyAreas, persistPatch]
  );

  const toggleInjury = useCallback(
    (area: BodyArea) => {
      togglePatientInjuryHighlight(patient.id, area);
      void savePersistedStateToCloud();
    },
    [patient.id, togglePatientInjuryHighlight, savePersistedStateToCloud]
  );

  const setLockMode = useCallback(
    (area: BodyArea, mode: LockUi) => {
      const cur = { ...(patient.manualClinicalSegmentLockOverrides ?? {}) };
      if (mode === 'auto') delete cur[area];
      else cur[area] = mode;
      persistPatch({
        manualClinicalSegmentLockOverrides: Object.keys(cur).length ? cur : undefined,
      });
    },
    [patient.manualClinicalSegmentLockOverrides, persistPatch]
  );

  const injurySet = new Set(patient.injuryHighlightSegments ?? []);
  const secondarySet = new Set(patient.secondaryClinicalBodyAreas ?? []);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden"
      dir="rtl"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-bold text-slate-950">ניהול אזורי גוף</h2>
        <p className="text-xs text-slate-600 mt-1">
          שינויים נשמרים בפרופיל המטופל ומסונכרנים ל־Supabase. לחיצה על המודל מחזירה מוקד ראשי/משני
          כמו קודם.
        </p>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-5">
        <div
          className="rounded-xl border border-teal-100 overflow-hidden min-h-[420px]"
          style={{ background: '#f8fafc' }}
        >
          <BodyMap3D
            wrapperClassName="h-full min-h-[420px]"
            activeAreas={activeAreas}
            primaryArea={patient.primaryBodyArea}
            clinicalArea={patient.primaryBodyArea}
            painByArea={patient.analytics.painByArea}
            level={patient.level}
            injuryHighlightSegments={patient.injuryHighlightSegments}
            secondaryClinicalBodyAreas={patient.secondaryClinicalBodyAreas}
            manualClinicalSegmentLockOverrides={patient.manualClinicalSegmentLockOverrides}
            stableInteraction
            selectedArea={null}
            onAreaClick={onMapClick}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="primary-body-select" className="text-xs font-bold text-slate-700">
              מוקד ראשי (primaryBodyArea)
            </label>
            <select
              id="primary-body-select"
              value={patient.primaryBodyArea}
              onChange={(e) => persistPatch({ primaryBodyArea: e.target.value as BodyArea })}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
            >
              {sortedAreas.map((a) => (
                <option key={a} value={a}>
                  {bodyAreaLabels[a]}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            משני (כתום) = הדגשה משנית. דלקת (אדום) = מפת injuryHighlightSegments. נעילה = מראה מוקד
            קליני כפוי או מבוטל לעומת שרשרת אוטומטית.
          </p>

          <div className="rounded-xl border border-slate-200 overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs text-end min-w-[520px]">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-slate-600 font-bold">
                  <th className="p-2">אזור</th>
                  <th className="p-2">משני</th>
                  <th className="p-2">דלקת (אדום)</th>
                  <th className="p-2">נעילה</th>
                </tr>
              </thead>
              <tbody>
                {sortedAreas.map((area) => (
                  <tr key={area} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="p-2 font-semibold text-slate-900 whitespace-nowrap">
                      {bodyAreaLabels[area]}
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={secondarySet.has(area)}
                        onChange={() => toggleSecondary(area)}
                        className="rounded border-slate-400 text-amber-600"
                        aria-label={`משני — ${bodyAreaLabels[area]}`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={injurySet.has(area)}
                        onChange={() => toggleInjury(area)}
                        className="rounded border-slate-400 text-red-600"
                        aria-label={`דלקת — ${bodyAreaLabels[area]}`}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={lockFromPatient(patient.manualClinicalSegmentLockOverrides, area)}
                        onChange={(e) => setLockMode(area, e.target.value as LockUi)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold max-w-[7rem]"
                        aria-label={`נעילה — ${bodyAreaLabels[area]}`}
                      >
                        <option value="auto">אוטו</option>
                        <option value="force_locked">נעול</option>
                        <option value="force_unlocked">פתוח</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
