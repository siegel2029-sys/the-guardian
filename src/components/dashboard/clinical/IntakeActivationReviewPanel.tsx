import { useMemo, useState } from 'react';
import {
  Stethoscope,
  AlertTriangle,
  FlaskConical,
  Dumbbell,
  MapPin,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PortalSelect } from '../../ui/PortalDropdown';
import type { BodyArea, Exercise, PatientClinicalIntakeProfile } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { JOINT_BODY_AREAS } from '../../../body/jointBodyAreas';
import StructuredClinicalIntakeTabs from './StructuredClinicalIntakeTabs';

type Props = {
  clinicalDiagnosis: string;
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  profile: PatientClinicalIntakeProfile;
  onProfileChange: (next: PatientClinicalIntakeProfile) => void;
  onDifferentialChange: (next: string[]) => void;
  onPrecautionsChange: (next: string[]) => void;
  onRecommendedTestsChange: (next: string[]) => void;
  primaryBodyArea: BodyArea;
  onPrimaryBodyAreaChange: (area: BodyArea) => void;
  injuryHighlightSegments: BodyArea[];
  onInjuryHighlightChange: (areas: BodyArea[]) => void;
  secondaryClinicalBodyAreas: BodyArea[];
  onSecondaryClinicalChange: (areas: BodyArea[]) => void;
  allBodyAreas: BodyArea[];
  suggestedExercises: Exercise[];
  selectedExerciseIds: Set<string>;
  onToggleExercise: (libId: string) => void;
  onSelectAllExercises: () => void;
  onClearExercises: () => void;
  sourceGemini?: boolean;
  rationaleLinesHe?: string[];
};

function toggleArea(list: BodyArea[], area: BodyArea): BodyArea[] {
  return list.includes(area) ? list.filter((a) => a !== area) : [...list, area];
}

export default function IntakeActivationReviewPanel({
  clinicalDiagnosis,
  differentialDiagnosis,
  precautionsHe,
  recommendedTestsHe,
  profile,
  onProfileChange,
  onDifferentialChange,
  onPrecautionsChange,
  onRecommendedTestsChange,
  primaryBodyArea,
  onPrimaryBodyAreaChange,
  injuryHighlightSegments,
  onInjuryHighlightChange,
  secondaryClinicalBodyAreas,
  onSecondaryClinicalChange,
  allBodyAreas,
  suggestedExercises,
  selectedExerciseIds,
  onToggleExercise,
  onSelectAllExercises,
  onClearExercises,
  sourceGemini,
  rationaleLinesHe = [],
}: Props) {
  const [painEditorOpen, setPainEditorOpen] = useState(false);

  const painBadgeLabel = useMemo(() => {
    const parts: string[] = [bodyAreaLabels[primaryBodyArea]];
    for (const a of injuryHighlightSegments) {
      const label = bodyAreaLabels[a];
      if (!parts.includes(label)) parts.push(label);
    }
    for (const a of secondaryClinicalBodyAreas) {
      const label = bodyAreaLabels[a];
      if (!parts.includes(label)) parts.push(label);
    }
    return parts.join(' / ');
  }, [primaryBodyArea, injuryHighlightSegments, secondaryClinicalBodyAreas]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Diagnosis + pain map inline edit */}
      <header className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              אבחון / רושם
            </p>
            <p className="text-base font-black text-slate-900 mt-0.5 leading-snug">
              {clinicalDiagnosis}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] font-semibold text-slate-500">מיקוד / מפת כאב</span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-900"
              >
                <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                {painBadgeLabel}
              </span>
              <button
                type="button"
                onClick={() => setPainEditorOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                aria-expanded={painEditorOpen}
                aria-label="עריכת אזורי כאב במפה"
              >
                <Pencil className="w-3 h-3" aria-hidden />
                עריכה
                {painEditorOpen ? (
                  <ChevronUp className="w-3 h-3" aria-hidden />
                ) : (
                  <ChevronDown className="w-3 h-3" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>

        {painEditorOpen && (
          <div
            className="mt-3 pt-3 border-t border-slate-100 space-y-3"
            role="region"
            aria-label="עריכת אזורי כאב"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                אזור מרכזי (תוכנית + מפה)
              </label>
              <PortalSelect
                value={primaryBodyArea}
                onChange={(v) => onPrimaryBodyAreaChange(v as BodyArea)}
                options={allBodyAreas.map((a) => ({ value: a, label: bodyAreaLabels[a] }))}
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm w-full max-w-xs"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-red-800 mb-1.5">הדגשת פגיעה (אדום)</p>
              <div className="flex flex-wrap gap-1.5">
                {JOINT_BODY_AREAS.map((a) => {
                  const on = injuryHighlightSegments.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => onInjuryHighlightChange(toggleArea(injuryHighlightSegments, a))}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                        on
                          ? 'bg-red-100 border-red-400 text-red-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-red-200'
                      }`}
                    >
                      {bodyAreaLabels[a]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-orange-800 mb-1.5">שרשרת / משני (כתום)</p>
              <div className="flex flex-wrap gap-1.5">
                {JOINT_BODY_AREAS.map((a) => {
                  const on = secondaryClinicalBodyAreas.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => onSecondaryClinicalChange(toggleArea(secondaryClinicalBodyAreas, a))}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                        on
                          ? 'bg-orange-100 border-orange-400 text-orange-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-orange-200'
                      }`}
                    >
                      {bodyAreaLabels[a]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {sourceGemini && rationaleLinesHe.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-indigo-900/90 leading-relaxed space-y-1">
            {rationaleLinesHe.slice(0, 3).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
      </header>

      {/* Always-visible clinical context */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section
          className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 lg:col-span-1"
          aria-label="אבחנה מבדלת"
        >
          <h3 className="text-xs font-black text-indigo-950 flex items-center gap-1.5 mb-2">
            <Stethoscope className="w-4 h-4 shrink-0" aria-hidden />
            אבחנה מבדלת
          </h3>
          <ul className="space-y-1.5">
            {(differentialDiagnosis.length ? differentialDiagnosis : ['']).map((item, i) => (
              <li key={i} className="flex gap-1.5 items-start">
                <span className="text-indigo-400 font-bold mt-2 shrink-0" aria-hidden>
                  •
                </span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const next = [...differentialDiagnosis];
                    if (next.length === 0) next.push('');
                    next[i] = e.target.value;
                    onDifferentialChange(next.filter((s, idx) => s.trim() || idx < next.length - 1));
                  }}
                  className="flex-1 rounded-lg border border-indigo-200/80 bg-white/90 px-2 py-1.5 text-sm text-indigo-950"
                  placeholder="חלופה אבחנתית"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onDifferentialChange([...differentialDiagnosis, ''])}
            className="mt-2 text-[10px] font-semibold text-indigo-700 hover:underline"
          >
            + חלופה
          </button>
        </section>

        <section
          className="rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 p-3 shadow-sm lg:col-span-1"
          aria-label="ממה להיזהר ונקודות דגש"
        >
          <h3 className="text-xs font-black text-amber-950 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden />
            ממה להיזהר / נקודות דגש
          </h3>
          <ul className="space-y-2">
            {(precautionsHe.length ? precautionsHe : ['']).map((line, i) => (
              <li key={i}>
                <textarea
                  value={line}
                  onChange={(e) => {
                    const next = [...precautionsHe];
                    if (next.length === 0) next.push('');
                    next[i] = e.target.value;
                    onPrecautionsChange(
                      next.filter((s, idx) => s.trim() || idx < next.length - 1)
                    );
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-amber-300/90 bg-white/80 px-2 py-1.5 text-sm text-amber-950 leading-relaxed resize-y min-h-[2.5rem]"
                  placeholder="דגש קליני או אזהרה"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onPrecautionsChange([...precautionsHe, ''])}
            className="mt-2 text-[10px] font-semibold text-amber-800 hover:underline"
          >
            + דגש
          </button>
        </section>

        <section
          className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 lg:col-span-1"
          aria-label="בדיקות מומלצות נוספות"
        >
          <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-2">
            <FlaskConical className="w-4 h-4 text-slate-600 shrink-0" aria-hidden />
            בדיקות מומלצות נוספות
          </h3>
          <ul className="space-y-1.5">
            {(recommendedTestsHe.length ? recommendedTestsHe : ['']).map((test, i) => (
              <li key={i} className="flex gap-1.5 items-center">
                <input
                  type="text"
                  value={test}
                  onChange={(e) => {
                    const next = [...recommendedTestsHe];
                    if (next.length === 0) next.push('');
                    next[i] = e.target.value;
                    onRecommendedTestsChange(
                      next.filter((s, idx) => s.trim() || idx < next.length - 1)
                    );
                  }}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  placeholder="בדיקה מומלצת"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onRecommendedTestsChange([...recommendedTestsHe, ''])}
            className="mt-2 text-[10px] font-semibold text-slate-600 hover:underline"
          >
            + בדיקה
          </button>
        </section>
      </div>

      <StructuredClinicalIntakeTabs profile={profile} onProfileChange={onProfileChange} />

      {/* Exercise library */}
      <section
        className="rounded-xl border border-teal-200 bg-white overflow-hidden"
        aria-label="ספריית תרגילים מוצעת"
      >
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-teal-100 bg-teal-50/80">
          <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
            <Dumbbell className="w-4 h-4 text-teal-600" aria-hidden />
            תרגילים מוצעים ({selectedExerciseIds.size} נבחרו)
          </span>
          <div className="flex gap-2 text-[11px] font-medium">
            <button
              type="button"
              onClick={onSelectAllExercises}
              className="text-teal-700 hover:underline"
            >
              בחר הכל
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onClearExercises}
              className="text-slate-500 hover:underline"
            >
              נקה
            </button>
          </div>
        </div>
        <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
          {suggestedExercises.map((ex) => {
            const on = selectedExerciseIds.has(ex.id);
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onToggleExercise(ex.id)}
                  className={`w-full text-right px-3.5 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                    on ? 'bg-teal-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px] font-bold ${
                      on ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-white'
                    }`}
                    aria-hidden
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-800 block">{ex.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {ex.muscleGroup} · {bodyAreaLabels[ex.targetArea]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {suggestedExercises.length === 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 p-3">אין תרגילים מוצעים לאזור זה.</p>
        )}
      </section>
    </div>
  );
}
