import { useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import BodyMap3D from '../../body-map/BodyMap3D';
import type { BodyArea, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import {
  canonicalPrimaryBodyAreaFromPrimaries,
  painPrimaryAutoSecondaryNeighbors,
  primaryPainAutoNeighborDisabled,
} from '../../../body/bodyPickMapping';

export default function PainManagement({
  patient: patientProp,
  onClose,
}: {
  patient: Patient;
  onClose: () => void;
}) {
  const {
    selectedPatient,
    getExercisePlan,
    savePersistedStateToCloud,
    applyTherapistPainFields,
  } = usePatient();

  const patient =
    selectedPatient?.id === patientProp.id ? selectedPatient : patientProp;

  const plan = getExercisePlan(patient.id);
  const activeAreas = useMemo(() => {
    if (!plan?.exercises.length) return [patient.primaryBodyArea];
    return [...new Set(plan.exercises.map((e) => e.targetArea))];
  }, [plan, patient.primaryBodyArea]);

  const primarySet = useMemo(
    () => new Set(patient.injuryHighlightSegments ?? []),
    [patient.injuryHighlightSegments]
  );

  const secondarySet = useMemo(
    () => new Set(patient.secondaryClinicalBodyAreas ?? []),
    [patient.secondaryClinicalBodyAreas]
  );

  const sortedAreas = useMemo(
    () =>
      (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
        bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
      ),
    []
  );

  const persist = useCallback(
    (nextPrimary: Set<BodyArea>, nextSecondary: Set<BodyArea>) => {
      const pri = [...nextPrimary];
      const sec = [...nextSecondary].filter((a) => !nextPrimary.has(a));
      const primaryBodyArea = canonicalPrimaryBodyAreaFromPrimaries(
        nextPrimary,
        patient.primaryBodyArea
      );
      applyTherapistPainFields(patient.id, {
        injuryHighlightSegments: pri,
        secondaryClinicalBodyAreas: sec,
        primaryBodyArea,
      });
      void savePersistedStateToCloud();
    },
    [applyTherapistPainFields, patient.id, savePersistedStateToCloud]
  );

  const togglePrimary = useCallback(
    (area: BodyArea) => {
      const p = new Set(primarySet);
      const s = new Set(secondarySet);
      if (p.has(area)) {
        p.delete(area);
      } else {
        p.add(area);
        s.delete(area);
        if (!primaryPainAutoNeighborDisabled(area)) {
          for (const n of painPrimaryAutoSecondaryNeighbors(area)) {
            if (!p.has(n)) s.add(n);
          }
        }
      }
      persist(p, s);
    },
    [primarySet, secondarySet, persist]
  );

  const toggleSecondary = useCallback(
    (area: BodyArea) => {
      if (primarySet.has(area)) return;
      const s = new Set(secondarySet);
      if (s.has(area)) s.delete(area);
      else s.add(area);
      persist(primarySet, s);
    },
    [primarySet, secondarySet, persist]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pain-management-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-4xl max-h-[min(100dvh,940px)] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200"
        dir="rtl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
          <div>
            <h2 id="pain-management-title" className="text-lg font-bold text-slate-900">
              ניהול אזורי כאב
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              ראשי = אדום בפורטל; משני = כתום. בגפיים בלבד נוספים שכנים אוטומטית כמשנים — לא בגו/צוואר.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200"
            aria-label="סגור חלון"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="p-4 flex flex-col lg:flex-row gap-5">
          {/* RTL: פריט ראשון ב-DOM = ימין → אווטאר ימין; רשימה משמאל */}
          <div className="shrink-0 w-full lg:w-[min(100%,min(92vw,520px))] mx-auto lg:mx-0 order-1">
            <p className="text-[11px] font-bold text-slate-500 mb-2 text-center lg:text-end">
              תצוגה מקדימה (ללא לחיצה)
            </p>
            <div className="rounded-2xl overflow-hidden bg-[#fafafa] pointer-events-none select-none border border-slate-100">
              <BodyMap3D
                wrapperClassName="min-h-[min(480px,62dvh)] w-full"
                painPickerFlat
                innerFrameMaxWidthPx={560}
                avatarScale={1.72}
                activeAreas={activeAreas}
                primaryArea={patient.primaryBodyArea}
                clinicalArea={patient.primaryBodyArea}
                painByArea={patient.analytics.painByArea}
                level={patient.level}
                injuryHighlightSegments={patient.injuryHighlightSegments}
                secondaryClinicalBodyAreas={patient.secondaryClinicalBodyAreas}
                stableInteraction
                selectedArea={null}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center lg:text-end leading-relaxed">
              ביטול ראשי מסיר רק את הסימון האדום של אותו מקטע; משנים נשארים עד שמבטלים ידנית.
            </p>
          </div>

          <div className="flex-1 min-w-0 order-2 max-h-[min(52dvh,560px)] overflow-y-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm text-end border-collapse" dir="rtl">
              <thead className="bg-slate-50 sticky top-0 z-[1] border-b border-slate-200">
                <tr className="text-slate-600 text-[11px] font-bold">
                  <th className="p-2.5 text-end align-middle">אזור גוף</th>
                  <th className="p-2.5 w-[5.5rem] text-center align-middle">
                    <span className="text-red-600">אזור עיקרי</span>
                  </th>
                  <th className="p-2.5 w-[5.5rem] text-center align-middle">
                    <span className="text-orange-600">אזור משני</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAreas.map((a) => {
                  const isPri = primarySet.has(a);
                  const isSec = secondarySet.has(a) && !isPri;
                  return (
                    <tr key={a} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="p-2.5 font-medium text-slate-900 text-end">{bodyAreaLabels[a]}</td>
                      <td className="p-2.5">
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={isPri}
                            onChange={() => togglePrimary(a)}
                            className="w-4 h-4 rounded border-slate-400 text-red-600 accent-red-600"
                            aria-label={`אזור עיקרי — ${bodyAreaLabels[a]}`}
                          />
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={isSec}
                            disabled={isPri}
                            onChange={() => toggleSecondary(a)}
                            className="w-4 h-4 rounded border-slate-400 text-amber-600 accent-amber-500 disabled:opacity-40"
                            aria-label={`אזור משני — ${bodyAreaLabels[a]}`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
