import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import BodyMap3D from '../../body-map/BodyMap3D';
import { usePatient } from '../../../context/PatientContext';
import type { BodyArea, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { getStrengthenedBodyAreasToday } from '../../../utils/strengthenedAreasToday';
import { deriveDiagnosisHeadline } from '../../../utils/clinicalNarrative';

const ALL_AREAS_SORTED: BodyArea[] = (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
  bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
);

export default function PatientClinicalRecordSection({ patient }: { patient: Patient }) {
  const {
    togglePatientInjuryHighlight,
    clearPatientInjuryHighlights,
    getPatientExerciseFinishReports,
    getExercisePlan,
    updatePatient,
    savePersistedStateToCloud,
  } = usePatient();

  const savedNarrative = (patient.geminiClinicalNarrative ?? patient.diagnosis ?? '').trim();
  const [narrativeDraft, setNarrativeDraft] = useState(savedNarrative);
  const [narrativeSaveBusy, setNarrativeSaveBusy] = useState(false);
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNarrativeDraft(savedNarrative);
  }, [patient.id, patient.geminiClinicalNarrative, patient.diagnosis]);

  const narrativeDirty = narrativeDraft.trim() !== savedNarrative;

  const scheduleCloudSave = useCallback(() => {
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = window.setTimeout(() => {
      cloudTimerRef.current = null;
      void savePersistedStateToCloud();
    }, 500);
  }, [savePersistedStateToCloud]);

  useEffect(() => {
    return () => {
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, []);

  const handleSaveNarrative = useCallback(async () => {
    setNarrativeSaveBusy(true);
    try {
      const trimmed = narrativeDraft.trim();
      updatePatient(patient.id, {
        geminiClinicalNarrative: trimmed,
        diagnosis: deriveDiagnosisHeadline(trimmed),
      });
      await savePersistedStateToCloud();
    } finally {
      setNarrativeSaveBusy(false);
    }
  }, [narrativeDraft, patient.id, updatePatient, savePersistedStateToCloud]);

  const handleToggleArea = useCallback(
    (area: BodyArea) => {
      togglePatientInjuryHighlight(patient.id, area);
      scheduleCloudSave();
    },
    [patient.id, togglePatientInjuryHighlight, scheduleCloudSave]
  );

  const plan = getExercisePlan(patient.id);
  const activeAreas = useMemo(
    () => (plan ? [...new Set(plan.exercises.map((e) => e.targetArea))] : []),
    [plan]
  );

  const strengthenedToday = useMemo(
    () => getStrengthenedBodyAreasToday(getPatientExerciseFinishReports(patient.id)),
    [patient.id, getPatientExerciseFinishReports]
  );

  const injurySet = useMemo(
    () => new Set(patient.injuryHighlightSegments ?? []),
    [patient.injuryHighlightSegments]
  );

  return (
    <>
      <div
        className="rounded-2xl border bg-white shadow-sm mb-5 overflow-hidden"
        style={{ borderColor: '#e2e8f0' }}
        dir="rtl"
      >
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <h2 className="text-base font-black text-slate-900">תיעוד קליני ומפת גוף</h2>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            ניתוח Gemini — עריכה ושמירה; אזורי כאב מסומנים ברשימה ומסונכרנים אוטומטית לענן. המפה
            לתצוגה בלבד.
          </p>
        </div>

        <div className="p-5 space-y-5">
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-2">ניתוח Gemini — אבחנה מקצועית</h3>
            <textarea
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="הניתוח האחרון מ-Gemini או עריכה ידנית — לחצו «שמור» לעדכון הפרופיל…"
              aria-label="ניתוח קליני Gemini"
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                type="button"
                disabled={!narrativeDirty || narrativeSaveBusy}
                onClick={() => void handleSaveNarrative()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}
              >
                {narrativeSaveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                שמור
              </button>
              {narrativeDirty && (
                <span className="text-xs text-amber-700 font-medium">יש שינויים שלא נשמרו</span>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-teal-600" />
              אזורי כאב — רשימה (מסונכרנת למפה)
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
              סמנו אזורים — ההדגשה האדומה במפת הגוף מתעדכנת מיד. השינויים נשמרים לענן אוטומטית.
            </p>
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => {
                  clearPatientInjuryHighlights(patient.id);
                  scheduleCloudSave();
                }}
                className="text-xs font-semibold text-red-800 hover:underline"
              >
                נקה את כל הסימונים
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 divide-y divide-slate-100">
              {ALL_AREAS_SORTED.map((area) => (
                <label
                  key={area}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/80 text-sm text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={injurySet.has(area)}
                    onChange={() => handleToggleArea(area)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500/40 shrink-0"
                  />
                  <span>{bodyAreaLabels[area]}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-2">תצוגת מפה (קריאה בלבד)</h3>
            <div
              className="rounded-2xl border overflow-hidden flex flex-col"
              style={{ borderColor: '#e0f2f1', minHeight: '360px' }}
            >
              <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: '340px' }}>
                <BodyMap3D
                  wrapperClassName="h-full min-h-0 flex-1"
                  activeAreas={activeAreas}
                  primaryArea={patient.primaryBodyArea}
                  clinicalArea={patient.primaryBodyArea}
                  secondaryClinicalBodyAreas={patient.secondaryClinicalBodyAreas}
                  stableInteraction
                  painByArea={patient.analytics.painByArea}
                  level={patient.level}
                  xp={patient.xp}
                  xpForNextLevel={patient.xpForNextLevel}
                  streak={patient.currentStreak}
                  strengthenedAreasToday={strengthenedToday}
                  injuryHighlightSegments={patient.injuryHighlightSegments}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
