import { useMemo, useState } from 'react';
import {
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
import { MedicalIntakeSectionedReport } from './MedicalIntakeDashboard';

type Props = {
  clinicalDiagnosis: string;
  onClinicalDiagnosisChange: (next: string) => void;
  caseStory: string;
  onCaseStoryChange: (next: string) => void;
  vasScore: number | null;
  onVasScoreChange: (next: number | null) => void;
  clinicalConclusionsHe: string[];
  onClinicalConclusionsChange: (next: string[]) => void;
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
};

function toggleArea(list: BodyArea[], area: BodyArea): BodyArea[] {
  return list.includes(area) ? list.filter((a) => a !== area) : [...list, area];
}

function PainMapEditor({
  primaryBodyArea,
  onPrimaryBodyAreaChange,
  injuryHighlightSegments,
  onInjuryHighlightChange,
  secondaryClinicalBodyAreas,
  onSecondaryClinicalChange,
  allBodyAreas,
  painBadgeLabel,
  painEditorOpen,
  onToggleEditor,
}: {
  primaryBodyArea: BodyArea;
  onPrimaryBodyAreaChange: (area: BodyArea) => void;
  injuryHighlightSegments: BodyArea[];
  onInjuryHighlightChange: (areas: BodyArea[]) => void;
  secondaryClinicalBodyAreas: BodyArea[];
  onSecondaryClinicalChange: (areas: BodyArea[]) => void;
  allBodyAreas: BodyArea[];
  painBadgeLabel: string;
  painEditorOpen: boolean;
  onToggleEditor: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      aria-label="מיקוד ומפת כאב"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">מיקוד / מפת כאב</p>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-900">
            <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
            {painBadgeLabel}
          </span>
          <button
            type="button"
            onClick={onToggleEditor}
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

      {painEditorOpen && (
        <div
          className="mt-3 pt-3 border-t border-slate-200/80 space-y-3"
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
    </section>
  );
}

export default function IntakeActivationReviewPanel({
  clinicalDiagnosis,
  onClinicalDiagnosisChange,
  caseStory,
  onCaseStoryChange,
  vasScore,
  onVasScoreChange,
  clinicalConclusionsHe,
  onClinicalConclusionsChange,
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
    <div className="space-y-6" dir="rtl">
      <MedicalIntakeSectionedReport
        caseStory={caseStory}
        onCaseStoryChange={onCaseStoryChange}
        vasScore={vasScore}
        onVasScoreChange={onVasScoreChange}
        clinicalDiagnosis={clinicalDiagnosis}
        onClinicalDiagnosisChange={onClinicalDiagnosisChange}
        differentialDiagnosis={differentialDiagnosis}
        onDifferentialChange={onDifferentialChange}
        clinicalConclusionsHe={clinicalConclusionsHe}
        onClinicalConclusionsChange={onClinicalConclusionsChange}
        precautionsHe={precautionsHe}
        onPrecautionsChange={onPrecautionsChange}
        recommendedTestsHe={recommendedTestsHe}
        onRecommendedTestsChange={onRecommendedTestsChange}
        profile={profile}
        onProfileChange={onProfileChange}
        objectiveEditable
        sourceGemini={sourceGemini}
      >
        <PainMapEditor
          primaryBodyArea={primaryBodyArea}
          onPrimaryBodyAreaChange={onPrimaryBodyAreaChange}
          injuryHighlightSegments={injuryHighlightSegments}
          onInjuryHighlightChange={onInjuryHighlightChange}
          secondaryClinicalBodyAreas={secondaryClinicalBodyAreas}
          onSecondaryClinicalChange={onSecondaryClinicalChange}
          allBodyAreas={allBodyAreas}
          painBadgeLabel={painBadgeLabel}
          painEditorOpen={painEditorOpen}
          onToggleEditor={() => setPainEditorOpen((o) => !o)}
        />
      </MedicalIntakeSectionedReport>

      <section
        className="rounded-xl border border-teal-200 bg-white overflow-hidden shadow-sm"
        aria-label="ספריית תרגילים מוצעת"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-teal-100 bg-teal-50/80">
          <span className="text-sm font-bold text-teal-950 flex items-center gap-1.5">
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
                  className={`w-full text-right px-4 py-2.5 text-sm flex items-start gap-2 transition-colors ${
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
