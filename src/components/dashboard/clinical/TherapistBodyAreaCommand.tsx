import { useMemo, useCallback } from 'react';
import BodyMap3D from '../../body-map/BodyMap3D';
import type { BodyArea, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';

/**
 * כלי מפת גוף (מטפל) — מפת 3D + בחירת מוקד ראשי.
 * רשימת ראשי/משני מלאה: מסך «ניהול אזורי כאב» בכרטיס המטופל (`PainManagement`).
 */
export default function TherapistBodyAreaCommand({
  patient,
  omitMap = false,
  hideChrome = false,
}: {
  patient: Patient;
  omitMap?: boolean;
  hideChrome?: boolean;
}) {
  const {
    getExercisePlan,
    savePersistedStateToCloud,
    cycleTherapistBodyMapClinical,
    setTherapistPrimaryBodyArea,
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

  const onMapClick = useCallback(
    (area: BodyArea) => {
      cycleTherapistBodyMapClinical(patient.id, area);
      void savePersistedStateToCloud();
    },
    [patient.id, cycleTherapistBodyMapClinical, savePersistedStateToCloud]
  );

  return (
    <div
      className={
        omitMap
          ? 'overflow-hidden'
          : 'rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden'
      }
      dir="rtl"
    >
      {hideChrome ? null : (
        <div
          className={
            omitMap
              ? 'px-0 py-0 border-b-0 bg-transparent'
              : 'px-5 py-4 border-b border-slate-200 bg-slate-50'
          }
        >
          <h2 className="text-base font-bold text-slate-950">ניהול אזורי גוף</h2>
          <p className="text-xs text-slate-600 mt-1">
            לחיצה על המודל מחזירה מוקד ראשי/משני.
          </p>
        </div>
      )}

      <div
        className={
          omitMap
            ? 'p-0 grid grid-cols-1 gap-5'
            : 'p-5 grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_1fr] gap-5'
        }
      >
        {!omitMap && (
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
              stableInteraction
              selectedArea={null}
              onAreaClick={onMapClick}
            />
          </div>
        )}

        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="primary-body-select" className="text-xs font-bold text-slate-700">
              מוקד ראשי (primaryBodyArea)
            </label>
            <select
              id="primary-body-select"
              value={patient.primaryBodyArea}
              onChange={(e) => {
                setTherapistPrimaryBodyArea(patient.id, e.target.value as BodyArea);
                void savePersistedStateToCloud();
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
            >
              {sortedAreas.map((a) => (
                <option key={a} value={a}>
                  {bodyAreaLabels[a]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
