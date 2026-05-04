import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import BodyMap3D from '../../body-map/BodyMap3D';
import type { BodyArea, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import {
  canonicalPrimaryBodyAreaFromPrimaries,
  PAIN_MANAGEMENT_TABLE_ROWS,
  painManagementRowAreas,
  painPrimaryAutoSecondaryNeighbors,
  primaryPainAutoNeighborDisabled,
  type PainManagementTableRow,
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
    [
      applyTherapistPainFields,
      patient.id,
      patient.primaryBodyArea,
      savePersistedStateToCloud,
    ]
  );

  const addPrimaryWithAutoSecondary = useCallback(
    (p: Set<BodyArea>, s: Set<BodyArea>, area: BodyArea) => {
      p.add(area);
      s.delete(area);
      if (!primaryPainAutoNeighborDisabled(area)) {
        for (const n of painPrimaryAutoSecondaryNeighbors(area)) {
          if (!p.has(n)) s.add(n);
        }
      }
    },
    []
  );

  const togglePrimary = useCallback(
    (area: BodyArea) => {
      const p = new Set(primarySet);
      const s = new Set(secondarySet);
      if (p.has(area)) {
        p.delete(area);
      } else {
        addPrimaryWithAutoSecondary(p, s, area);
      }
      persist(p, s);
    },
    [primarySet, secondarySet, persist, addPrimaryWithAutoSecondary]
  );

  const togglePrimaryRow = useCallback(
    (row: PainManagementTableRow) => {
      const areas = painManagementRowAreas(row);
      const p = new Set(primarySet);
      const s = new Set(secondarySet);
      const anyPri = areas.some((a) => p.has(a));
      if (anyPri) {
        for (const a of areas) p.delete(a);
      } else {
        for (const a of areas) {
          if (!p.has(a)) addPrimaryWithAutoSecondary(p, s, a);
        }
      }
      persist(p, s);
    },
    [primarySet, secondarySet, persist, addPrimaryWithAutoSecondary]
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

  const toggleSecondaryRow = useCallback(
    (row: PainManagementTableRow) => {
      const areas = painManagementRowAreas(row);
      if (areas.some((a) => primarySet.has(a))) return;
      const s = new Set(secondarySet);
      const anySec = areas.some((a) => s.has(a));
      if (anySec) {
        for (const a of areas) s.delete(a);
      } else {
        for (const a of areas) {
          if (!primarySet.has(a)) s.add(a);
        }
      }
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
        className="relative w-full sm:max-w-4xl max-h-[min(100dvh,960px)] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200"
        dir="rtl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
          <div>
            <h2 id="pain-management-title" className="text-lg font-bold text-slate-900">
              ניהול אזורי כאב
            </h2>
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

        <div className="p-4 flex flex-col lg:flex-row gap-4">
          <div className="shrink-0 flex-1 min-w-0 order-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-[min(64dvh,720px)] rounded-2xl overflow-hidden pointer-events-none select-none border border-slate-200/90 bg-slate-100 flex items-center justify-center lg:justify-end">
              <BodyMap3D
                wrapperClassName="w-full h-full min-h-[min(60dvh,680px)] max-w-full"
                painPickerFlat
                painPickerCleanBackground
                innerFrameMaxWidthPx={2000}
                avatarScale={1.1}
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
          </div>

          <div className="w-full lg:w-[340px] shrink-0 order-2 max-h-[min(56dvh,720px)] overflow-y-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-0 text-sm text-end border-collapse table-fixed" dir="rtl">
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
                {PAIN_MANAGEMENT_TABLE_ROWS.map((row) => (
                  <PainTableRow
                    key={row.kind === 'single' ? row.area : `g:${row.label}`}
                    row={row}
                    primarySet={primarySet}
                    secondarySet={secondarySet}
                    onTogglePrimary={
                      row.kind === 'single'
                        ? () => togglePrimary(row.area)
                        : () => togglePrimaryRow(row)
                    }
                    onToggleSecondary={
                      row.kind === 'single'
                        ? () => toggleSecondary(row.area)
                        : () => toggleSecondaryRow(row)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function PainTableRow({
  row,
  primarySet,
  secondarySet,
  onTogglePrimary,
  onToggleSecondary,
}: {
  row: PainManagementTableRow;
  primarySet: ReadonlySet<BodyArea>;
  secondarySet: ReadonlySet<BodyArea>;
  onTogglePrimary: () => void;
  onToggleSecondary: () => void;
}) {
  const areas = painManagementRowAreas(row);
  const label =
    row.kind === 'single' ? bodyAreaLabels[row.area] : row.label;

  const priCount = areas.filter((a) => primarySet.has(a)).length;
  const isPri = priCount === areas.length;
  const isPriIndeterminate = priCount > 0 && priCount < areas.length;

  const secEligible = areas.filter((a) => !primarySet.has(a));
  const secCount = secEligible.filter((a) => secondarySet.has(a)).length;
  const isSec = secEligible.length > 0 && secCount === secEligible.length;
  const isSecIndeterminate = secCount > 0 && secCount < secEligible.length;

  const rowLockedSecondary = areas.some((a) => primarySet.has(a));

  const priRef = useRef<HTMLInputElement>(null);
  const secRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const el = priRef.current;
    if (el) el.indeterminate = isPriIndeterminate;
  }, [isPriIndeterminate]);

  useLayoutEffect(() => {
    const el = secRef.current;
    if (el) el.indeterminate = isSecIndeterminate;
  }, [isSecIndeterminate]);

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/80">
      <td className="p-2.5 font-medium text-slate-900 text-end">{label}</td>
      <td className="p-2.5">
        <div className="flex justify-center">
          <input
            ref={priRef}
            type="checkbox"
            checked={isPri}
            onChange={onTogglePrimary}
            className="w-4 h-4 rounded border-slate-400 text-red-600 accent-red-600"
            aria-label={`אזור עיקרי — ${label}`}
          />
        </div>
      </td>
      <td className="p-2.5">
        <div className="flex justify-center">
          <input
            ref={secRef}
            type="checkbox"
            checked={isSec}
            disabled={rowLockedSecondary}
            onChange={onToggleSecondary}
            className="w-4 h-4 rounded border-slate-400 text-amber-600 accent-amber-500 disabled:opacity-40"
            aria-label={`אזור משני — ${label}`}
          />
        </div>
      </td>
    </tr>
  );
}
