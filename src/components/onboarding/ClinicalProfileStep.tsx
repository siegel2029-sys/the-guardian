import { useState } from 'react';
import ClinicalScaleSlider from '../patient/ClinicalScaleSlider';
import {
  clinicalProfileSchema,
  DURATION_OPTIONS,
} from '../../services/onboardingLeadService';
import type { ClinicalDraft } from '../../hooks/useOnboardingWizard';
import {
  WIZARD_CARD_CLASS,
  WIZARD_ERROR_CLASS,
  WIZARD_INPUT_CLASS,
  WIZARD_LABEL_CLASS,
  WIZARD_PRIMARY_BUTTON_CLASS,
  WIZARD_SECONDARY_BUTTON_CLASS,
  WIZARD_TEXTAREA_CLASS,
} from './wizardUi';

type ClinicalProfileStepProps = {
  clinical: ClinicalDraft;
  onUpdate: (partial: Partial<ClinicalDraft>) => void;
  onBack: () => void;
  onContinue: () => void;
};

type FieldErrors = Partial<Record<keyof ClinicalDraft, string>>;

export default function ClinicalProfileStep({
  clinical,
  onUpdate,
  onBack,
  onContinue,
}: ClinicalProfileStepProps) {
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleContinue = () => {
    const result = clinicalProfileSchema.safeParse({
      painLocation: clinical.painLocation,
      painLevel: clinical.painLevel,
      aggravatingEasing: clinical.aggravatingEasing,
      duration: clinical.duration,
      hardestActivities: clinical.hardestActivities,
      movementFear: clinical.movementFear,
      rehabGoal: clinical.rehabGoal,
    });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ClinicalDraft | undefined;
        if (field && !next[field]) {
          next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onContinue();
  };

  const clearError = (field: keyof ClinicalDraft) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">קצת על המצב שלך</h1>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
          המידע הזה עוזר לנו להתאים לך את המסלול הנכון. כל השדות נדרשים.
        </p>
      </div>

      <div className={`${WIZARD_CARD_CLASS} space-y-5`}>
        <div>
          <label htmlFor="pain-location" className={WIZARD_LABEL_CLASS}>
            מיקום הכאב העיקרי
          </label>
          <input
            id="pain-location"
            type="text"
            inputMode="text"
            value={clinical.painLocation}
            onChange={(e) => {
              onUpdate({ painLocation: e.target.value });
              clearError('painLocation');
            }}
            placeholder="למשל: גב תחתון, כתף ימין"
            className={WIZARD_INPUT_CLASS}
            aria-invalid={Boolean(errors.painLocation)}
          />
          {errors.painLocation && <p className={WIZARD_ERROR_CLASS}>{errors.painLocation}</p>}
        </div>

        <div>
          <ClinicalScaleSlider
            id="pain-level"
            label="עוצמת הכאב כרגע (0–10)"
            value={clinical.painLevel}
            onChange={(value) => {
              onUpdate({ painLevel: value });
              clearError('painLevel');
            }}
            min={0}
            max={10}
            minAnchor="ללא כאב"
            maxAnchor="כאב בלתי נסבל"
            highRiskFrom={8}
          />
          {errors.painLevel && <p className={WIZARD_ERROR_CLASS}>{errors.painLevel}</p>}
        </div>

        <div>
          <label htmlFor="aggravating-easing" className={WIZARD_LABEL_CLASS}>
            תנועות מחמירות ומקלות
          </label>
          <textarea
            id="aggravating-easing"
            value={clinical.aggravatingEasing}
            onChange={(e) => {
              onUpdate({ aggravatingEasing: e.target.value });
              clearError('aggravatingEasing');
            }}
            placeholder="אילו תנועות מחמירות את הכאב, ואילו מקלות עליו?"
            className={WIZARD_TEXTAREA_CLASS}
            aria-invalid={Boolean(errors.aggravatingEasing)}
          />
          {errors.aggravatingEasing && (
            <p className={WIZARD_ERROR_CLASS}>{errors.aggravatingEasing}</p>
          )}
        </div>

        <div>
          <label htmlFor="duration" className={WIZARD_LABEL_CLASS}>
            כמה זמן סובל מהמצב?
          </label>
          <select
            id="duration"
            value={clinical.duration}
            onChange={(e) => {
              onUpdate({ duration: e.target.value });
              clearError('duration');
            }}
            className={`${WIZARD_INPUT_CLASS} ${clinical.duration ? '' : 'text-slate-400'}`}
            aria-invalid={Boolean(errors.duration)}
          >
            <option value="" disabled>
              נא לבחור משך זמן
            </option>
            {DURATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors.duration && <p className={WIZARD_ERROR_CLASS}>{errors.duration}</p>}
        </div>

        <div>
          <label htmlFor="hardest-activities" className={WIZARD_LABEL_CLASS}>
            ציין 2 פעולות יומיומיות שהכי קשה לך לבצע
          </label>
          <textarea
            id="hardest-activities"
            value={clinical.hardestActivities}
            onChange={(e) => {
              onUpdate({ hardestActivities: e.target.value });
              clearError('hardestActivities');
            }}
            placeholder="למשל: לגרוב גרביים, לשבת ליד המחשב שעה"
            className={WIZARD_TEXTAREA_CLASS}
            aria-invalid={Boolean(errors.hardestActivities)}
          />
          {errors.hardestActivities && (
            <p className={WIZARD_ERROR_CLASS}>{errors.hardestActivities}</p>
          )}
        </div>

        <div>
          <ClinicalScaleSlider
            id="movement-fear"
            label="עד כמה אתה חושש שתנועה תחמיר את מצבך? (1–5)"
            value={clinical.movementFear}
            onChange={(value) => {
              onUpdate({ movementFear: value });
              clearError('movementFear');
            }}
            min={1}
            max={5}
            minAnchor="כלל לא חושש"
            maxAnchor="חושש מאוד"
          />
          {errors.movementFear && <p className={WIZARD_ERROR_CLASS}>{errors.movementFear}</p>}
        </div>

        <div>
          <label htmlFor="rehab-goal" className={WIZARD_LABEL_CLASS}>
            מטרת השיקום המרכזית
          </label>
          <textarea
            id="rehab-goal"
            value={clinical.rehabGoal}
            onChange={(e) => {
              onUpdate({ rehabGoal: e.target.value });
              clearError('rehabGoal');
            }}
            placeholder="מה הכי חשוב לך לחזור לעשות?"
            className={WIZARD_TEXTAREA_CLASS}
            aria-invalid={Boolean(errors.rehabGoal)}
          />
          {errors.rehabGoal && <p className={WIZARD_ERROR_CLASS}>{errors.rehabGoal}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={handleContinue} className={WIZARD_PRIMARY_BUTTON_CLASS}>
          המשך
        </button>
        <button type="button" onClick={onBack} className={WIZARD_SECONDARY_BUTTON_CLASS}>
          חזרה
        </button>
      </div>
    </section>
  );
}
