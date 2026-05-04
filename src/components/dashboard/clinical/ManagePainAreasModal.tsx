import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import BodyMap3D from '../../body-map/BodyMap3D';
import type { BodyArea, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import TherapistBodyAreaCommand from './TherapistBodyAreaCommand';

type PainEditMode = 'primary' | 'injury_red' | 'secondary_orange';

const modeMeta: Record<
  PainEditMode,
  { label: string; short: string; activeClass: string }
> = {
  primary: {
    label: 'מוקד פעיל (טיפול)',
    short: 'מוקד',
    activeClass: 'bg-teal-600 text-white shadow-sm',
  },
  injury_red: {
    label: 'אזורים אדומים ראשיים (דלקת / הדגשה)',
    short: 'אדום',
    activeClass: 'bg-red-600 text-white shadow-sm',
  },
  secondary_orange: {
    label: 'אזורים כתומים משניים',
    short: 'כתום',
    activeClass: 'bg-amber-500 text-white shadow-sm',
  },
};

export default function ManagePainAreasModal({
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
    togglePatientInjuryHighlight,
    setTherapistPrimaryBodyArea,
    updatePatient,
  } = usePatient();

  const patient =
    selectedPatient?.id === patientProp.id ? selectedPatient : patientProp;

  const [mode, setMode] = useState<PainEditMode>('primary');

  const plan = getExercisePlan(patient.id);
  const activeAreas = useMemo(() => {
    if (!plan?.exercises.length) return [patient.primaryBodyArea];
    return [...new Set(plan.exercises.map((e) => e.targetArea))];
  }, [plan, patient.primaryBodyArea]);

  const sync = useCallback(() => {
    void savePersistedStateToCloud();
  }, [savePersistedStateToCloud]);

  const onMapClick = useCallback(
    (area: BodyArea) => {
      if (mode === 'primary') {
        setTherapistPrimaryBodyArea(patient.id, area);
      } else if (mode === 'injury_red') {
        togglePatientInjuryHighlight(patient.id, area);
      } else {
        const sec = [...(patient.secondaryClinicalBodyAreas ?? [])];
        const next = sec.includes(area) ? sec.filter((a) => a !== area) : [...sec, area];
        updatePatient(patient.id, { secondaryClinicalBodyAreas: next });
      }
      sync();
    },
    [
      mode,
      patient.id,
      patient.secondaryClinicalBodyAreas,
      setTherapistPrimaryBodyArea,
      togglePatientInjuryHighlight,
      updatePatient,
      sync,
    ]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pain-areas-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="סגור"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-3xl max-h-[min(100dvh,920px)] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200"
        dir="rtl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
          <div>
            <h2 id="pain-areas-modal-title" className="text-lg font-bold text-slate-900">
              ניהול אזורי כאב
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              שינויים נשמרים מיידית ומועלים ל־Supabase — המטופל רואה את אותן הדגשות בפורטל (3D).
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

        <div className="p-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-slate-600 mb-2">מצב עריכה בלחיצה על הגוף</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(modeMeta) as PainEditMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[40px] transition-colors border ${
                    mode === m
                      ? modeMeta[m].activeClass + ' border-transparent'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {modeMeta[m].label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-teal-100 overflow-hidden bg-slate-50">
            <BodyMap3D
              wrapperClassName="min-h-[min(360px,48dvh)] w-full"
              painPickerFlat
              innerFrameMaxWidthPx={440}
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

          <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
            <span className="rounded-lg bg-white border border-slate-200 px-2 py-1">
              מוקד: <strong>{bodyAreaLabels[patient.primaryBodyArea]}</strong>
            </span>
            <span className="rounded-lg bg-white border border-slate-200 px-2 py-1">
              אדום: {(patient.injuryHighlightSegments ?? []).length}
            </span>
            <span className="rounded-lg bg-white border border-slate-200 px-2 py-1">
              כתום: {(patient.secondaryClinicalBodyAreas ?? []).length}
            </span>
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50/80 open:bg-white open:shadow-sm">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-slate-800">
              הגדרות מתקדמות — בחירת מוקד מהרשימה ונעילות מקטע
            </summary>
            <div className="px-3 pb-4 border-t border-slate-100">
              <TherapistBodyAreaCommand patient={patient} omitMap hideChrome />
            </div>
          </details>

          <p className="text-[11px] text-slate-400 text-center pb-2">
            מצב נוכחי: <strong>{modeMeta[mode].short}</strong> — לחיצה על האווטאר מחליפה/מסירה לפי מצב זה
          </p>
        </div>
      </div>
    </div>
  );
}
