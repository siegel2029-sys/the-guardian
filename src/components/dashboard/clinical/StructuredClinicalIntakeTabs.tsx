import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Target, Stethoscope, HeartPulse, Plus, Trash2 } from 'lucide-react';
import type { PatientClinicalIntakeProfile } from '../../../types';
import {
  buildClinicalIntakeProfileSlots,
  type ClinicalIntakeProfileSlotId,
} from '../../../utils/clinicalIntakeProfileDisplay';
import {
  getClinicalIntakeProfileValidation,
  isClinicalIntakeFieldMissing,
  isClinicalIntakeTabMissing,
  type ClinicalIntakeProfileFieldKey,
  type ClinicalIntakeProfileValidation,
} from '../../../utils/clinicalIntakeProfileValidation';
import { intakeValidationFieldClass } from './patientDataUpdateHighlight';
import MissingFieldHint, { INTAKE_ACTIVATION_MISSING_HINT, MissingInfoBadge } from './MissingFieldHint';
import {
  emptyClinicalProfile,
  formatRomRow,
  formatStrengthRows,
  parseRomRow,
  parseStrengthRows,
  type RomTableRow,
} from './intakeReviewUtils';
import { useDebouncedCallback } from './useDebouncedCallback';
import { ensureRowIdList } from './structuredIntakeRowIds';

const TAB_IDS: ClinicalIntakeProfileSlotId[] = [
  'medical_history',
  'ranges',
  'strength',
  'goals',
];

const TAB_ICONS: Record<ClinicalIntakeProfileSlotId, typeof Activity> = {
  ranges: Activity,
  strength: HeartPulse,
  special_tests: Stethoscope,
  medical_history: Stethoscope,
  goals: Target,
};

const TAB_SHORT: Record<ClinicalIntakeProfileSlotId, string> = {
  medical_history: 'רקע',
  ranges: 'טווח תנועה',
  strength: 'כוח',
  special_tests: 'בדיקות',
  goals: 'מטרות',
};

const MMT_GRADES = ['', '0', '1', '1+', '2', '2+', '3', '3+', '4', '4+', '5'] as const;

const INPUT_BASE =
  'w-full rounded-lg border px-2 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/25';

type Props = {
  profile: PatientClinicalIntakeProfile;
  onProfileChange: (next: PatientClinicalIntakeProfile) => void;
  /** מצב השלמה — סימון סגול/ירוק לפי שדות חסרים */
  validationHighlight?: boolean;
  validation?: ClinicalIntakeProfileValidation;
  initialActiveTab?: ClinicalIntakeProfileSlotId;
  focusFirstMissingTab?: boolean;
  /** true = כל הקשה מעדכנת הורה מיד (מודל השלמה); false = debounce לשמירת פוקוס */
  syncParentImmediately?: boolean;
  className?: string;
};

function fieldClass(
  highlight: boolean,
  validation: ClinicalIntakeProfileValidation,
  field: ClinicalIntakeProfileFieldKey
): string {
  const missing = isClinicalIntakeFieldMissing(validation, field);
  return `${INPUT_BASE} ${intakeValidationFieldClass(missing, highlight)}`;
}

function tabButtonClass(
  tabId: ClinicalIntakeProfileSlotId,
  active: boolean,
  highlight: boolean,
  validation: ClinicalIntakeProfileValidation
): string {
  const tabMissing = isClinicalIntakeTabMissing(validation, tabId);
  if (active) {
    if (highlight && tabMissing) {
      return 'text-purple-950 bg-purple-100 border-b-2 border-purple-600 -mb-px';
    }
    return 'text-teal-800 bg-teal-50 border-b-2 border-teal-600 -mb-px';
  }
  if (highlight && tabMissing) {
    return 'text-purple-900 bg-purple-50/90 border-b-2 border-transparent hover:bg-purple-50';
  }
  if (highlight && !tabMissing) {
    return 'text-emerald-800 bg-emerald-50/50 hover:bg-emerald-50/80';
  }
  return 'text-slate-700 hover:bg-slate-50';
}

export default function StructuredClinicalIntakeTabs({
  profile,
  onProfileChange,
  validationHighlight = false,
  validation: validationProp,
  initialActiveTab = 'medical_history',
  focusFirstMissingTab = false,
  syncParentImmediately = false,
  className = '',
}: Props) {
  const [draft, setDraft] = useState<PatientClinicalIntakeProfile>(() => ({
    ...emptyClinicalProfile(),
    ...profile,
  }));
  const syncFromParentRef = useRef(false);

  const pushDraftToParent = useDebouncedCallback((next: PatientClinicalIntakeProfile) => {
    syncFromParentRef.current = true;
    onProfileChange(next);
  }, 320);

  useEffect(() => {
    if (syncFromParentRef.current) {
      syncFromParentRef.current = false;
      setDraft({ ...emptyClinicalProfile(), ...profile });
      return;
    }
    setDraft({ ...emptyClinicalProfile(), ...profile });
  }, [profile]);

  const validation = useMemo(
    () => validationProp ?? getClinicalIntakeProfileValidation(draft),
    [validationProp, draft]
  );

  const [activeTab, setActiveTab] = useState<ClinicalIntakeProfileSlotId>(initialActiveTab);
  const didFocusMissingRef = useRef(false);

  useEffect(() => {
    if (!focusFirstMissingTab || didFocusMissingRef.current) return;
    didFocusMissingRef.current = true;
    const first = getClinicalIntakeProfileValidation(draft).missingTabIds[0];
    if (first) setActiveTab(first);
  }, [focusFirstMissingTab, draft]);

  const [romRowIds, setRomRowIds] = useState<string[]>(() =>
    ensureRowIdList([], Math.max(1, profile.ranges?.length ?? 0), 'rom')
  );
  const [strengthRowIds, setStrengthRowIds] = useState<string[]>(() =>
    ensureRowIdList([], Math.max(1, parseStrengthRows(profile.muscle_strength).length), 'str')
  );
  const [goalRowIds, setGoalRowIds] = useState<string[]>(() =>
    ensureRowIdList([], Math.max(1, profile.goals?.length ?? 0), 'goal')
  );

  const slots = useMemo(() => buildClinicalIntakeProfileSlots(draft), [draft]);
  const slotById = useMemo(
    () => Object.fromEntries(slots.map((s) => [s.id, s])) as Record<
      ClinicalIntakeProfileSlotId,
      (typeof slots)[0]
    >,
    [slots]
  );

  const strengthRows = useMemo(
    () => parseStrengthRows(draft.muscle_strength),
    [draft.muscle_strength]
  );

  const highlight = validationHighlight;

  const commitDraft = (next: PatientClinicalIntakeProfile) => {
    setDraft(next);
    if (syncParentImmediately) {
      syncFromParentRef.current = true;
      onProfileChange(next);
    } else {
      pushDraftToParent(next);
    }
  };

  const updateProfile = (patch: Partial<PatientClinicalIntakeProfile>) => {
    commitDraft({ ...emptyClinicalProfile(), ...draft, ...patch });
  };

  const updateRanges = (ranges: string[]) => {
    setRomRowIds((prev) => ensureRowIdList(prev, Math.max(1, ranges.length), 'rom'));
    updateProfile({ ranges });
  };
  const updateGoals = (goals: string[]) => {
    setGoalRowIds((prev) => ensureRowIdList(prev, Math.max(1, goals.length), 'goal'));
    updateProfile({ goals });
  };

  const updateStrengthFromRows = (rows: { muscle: string; grade: string }[]) => {
    setStrengthRowIds((prev) => ensureRowIdList(prev, Math.max(1, rows.length), 'str'));
    updateProfile({ muscle_strength: formatStrengthRows(rows) });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'medical_history':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                מחלות רקע
                <MissingInfoBadge
                  show={
                    highlight && isClinicalIntakeFieldMissing(validation, 'backgroundDiseases')
                  }
                />
              </label>
              <textarea
                value={draft.medical_history?.backgroundDiseases ?? ''}
                onChange={(e) =>
                  updateProfile({
                    medical_history: {
                      ...(draft.medical_history ?? {}),
                      backgroundDiseases: e.target.value,
                    },
                  })
                }
                rows={3}
                className={`${fieldClass(highlight, validation, 'backgroundDiseases')} px-3 py-2`}
              />
              <MissingFieldHint
                show={
                  highlight && isClinicalIntakeFieldMissing(validation, 'backgroundDiseases')
                }
                message={INTAKE_ACTIVATION_MISSING_HINT}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                תרופות קבועות
                <MissingInfoBadge
                  show={
                    highlight && isClinicalIntakeFieldMissing(validation, 'chronicMedications')
                  }
                />
              </label>
              <textarea
                value={draft.medical_history?.chronicMedications ?? ''}
                onChange={(e) =>
                  updateProfile({
                    medical_history: {
                      ...(draft.medical_history ?? {}),
                      chronicMedications: e.target.value,
                    },
                  })
                }
                rows={2}
                className={`${fieldClass(highlight, validation, 'chronicMedications')} px-3 py-2`}
              />
              <MissingFieldHint
                show={
                  highlight && isClinicalIntakeFieldMissing(validation, 'chronicMedications')
                }
                message={INTAKE_ACTIVATION_MISSING_HINT}
              />
            </div>
          </div>
        );

      case 'ranges': {
        const rawRows = draft.ranges?.length ? [...draft.ranges] : [''];
        const parsed: RomTableRow[] = rawRows.map(parseRomRow);
        const patchRom = (nextParsed: RomTableRow[]) => {
          updateRanges(nextParsed.map(formatRomRow));
        };
        const rangesMissing = isClinicalIntakeFieldMissing(validation, 'ranges');
        return (
          <div
            className={
              highlight && rangesMissing
                ? 'rounded-lg border border-purple-400 bg-purple-50/50 p-2 -mx-0.5'
                : highlight && !rangesMissing
                  ? 'rounded-lg border border-emerald-400/80 bg-emerald-50/30 p-2 -mx-0.5'
                  : ''
            }
          >
            <p className="text-[11px] font-semibold text-slate-600 mb-2 flex flex-wrap items-center">
              טווחי תנועה (ROM)
              <MissingInfoBadge show={highlight && rangesMissing} />
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[420px] text-sm border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="text-right py-2 pr-1">תנועה / מפרק</th>
                    <th className="text-right py-2 px-1 w-[28%]">מעלה / ערך</th>
                    <th className="text-right py-2 pl-1 w-[36%]">הערות</th>
                    <th className="w-8" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => (
                    <tr key={romRowIds[i] ?? `rom-fallback-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-1">
                        <input
                          type="text"
                          value={row.movement}
                          placeholder="למשל כתף — כיפוף"
                          onChange={(e) => {
                            const next = [...parsed];
                            next[i] = { ...next[i], movement: e.target.value };
                            patchRom(next);
                          }}
                          className={fieldClass(highlight, validation, 'ranges')}
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.value}
                          placeholder="° / תיאור"
                          onChange={(e) => {
                            const next = [...parsed];
                            next[i] = { ...next[i], value: e.target.value };
                            patchRom(next);
                          }}
                          className={fieldClass(highlight, validation, 'ranges')}
                        />
                      </td>
                      <td className="py-1.5 pl-1">
                        <input
                          type="text"
                          value={row.note}
                          placeholder="אקטיבי / פסיבי / EOR"
                          onChange={(e) => {
                            const next = [...parsed];
                            next[i] = { ...next[i], note: e.target.value };
                            patchRom(next);
                          }}
                          className={
                            highlight
                              ? `${INPUT_BASE} ${intakeValidationFieldClass(rangesMissing, true)}`
                              : `${INPUT_BASE} border-slate-100`
                          }
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => patchRom(parsed.filter((_, j) => j !== i))}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                          aria-label="מחק שורה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => patchRom([...parsed, { movement: '', value: '', note: '' }])}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף שורת ROM
              </button>
            </div>
            <MissingFieldHint show={highlight && rangesMissing} message={INTAKE_ACTIVATION_MISSING_HINT} />
            {!slotById.ranges.hasData && !highlight && (
              <p className="text-xs text-slate-400 italic mt-2">{slotById.ranges.emptyHe}</p>
            )}
          </div>
        );
      }

      case 'strength': {
        const strengthMissing = isClinicalIntakeFieldMissing(validation, 'muscle_strength');
        return (
          <div
            className={
              highlight && strengthMissing
                ? 'rounded-lg border border-purple-400 bg-purple-50/50 p-2 -mx-0.5'
                : highlight && !strengthMissing
                  ? 'rounded-lg border border-emerald-400/80 bg-emerald-50/30 p-2 -mx-0.5'
                  : ''
            }
          >
            <p className="text-[11px] font-semibold text-slate-600 mb-2 flex flex-wrap items-center">
              כוח שרירים
              <MissingInfoBadge show={highlight && strengthMissing} />
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[360px] text-sm border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="text-right py-2 pr-1">שריר / קבוצה</th>
                    <th className="text-right py-2 pl-1 w-24">MMT</th>
                    <th className="w-8" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {strengthRows.map((row, i) => (
                    <tr key={strengthRowIds[i] ?? `str-fallback-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-1">
                        <input
                          type="text"
                          value={row.muscle}
                          placeholder='למשל Quadriceps או תיאור מלא: ג"ת 5/4 דו"צ'
                          onChange={(e) => {
                            const next = [...strengthRows];
                            next[i] = { ...next[i], muscle: e.target.value };
                            updateStrengthFromRows(next);
                          }}
                          className={fieldClass(highlight, validation, 'muscle_strength')}
                        />
                      </td>
                      <td className="py-1.5 pl-1">
                        <select
                          value={row.grade}
                          onChange={(e) => {
                            const next = [...strengthRows];
                            next[i] = { ...next[i], grade: e.target.value };
                            updateStrengthFromRows(next);
                          }}
                          className={`${fieldClass(highlight, validation, 'muscle_strength')} bg-white`}
                          aria-label="דרגת כוח"
                        >
                          {MMT_GRADES.map((g) => (
                            <option key={g || 'empty'} value={g}>
                              {g || '—'}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next = strengthRows.filter((_, j) => j !== i);
                            updateStrengthFromRows(
                              next.length ? next : [{ muscle: '', grade: '' }]
                            );
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                          aria-label="מחק שורה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() =>
                  updateStrengthFromRows([...strengthRows, { muscle: '', grade: '' }])
                }
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף שורת כוח
              </button>
            </div>
            <MissingFieldHint
              show={highlight && strengthMissing}
              message={INTAKE_ACTIVATION_MISSING_HINT}
            />
          </div>
        );
      }

      case 'goals': {
        const rows = draft.goals?.length ? [...draft.goals] : [''];
        const goalsMissing = isClinicalIntakeFieldMissing(validation, 'goals');
        return (
          <div
            className={
              highlight && goalsMissing
                ? 'rounded-lg border border-purple-400 bg-purple-50/50 p-2 -mx-0.5'
                : highlight && !goalsMissing
                  ? 'rounded-lg border border-emerald-400/80 bg-emerald-50/30 p-2 -mx-0.5'
                  : ''
            }
          >
            <p className="text-[11px] font-semibold text-slate-600 mb-2 flex flex-wrap items-center">
              מטרות שיקום
              <MissingInfoBadge show={highlight && goalsMissing} />
            </p>
            <ul className="space-y-2">
              {rows.map((goal, i) => (
                <li key={goalRowIds[i] ?? `goal-fallback-${i}`} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = e.target.value;
                      updateGoals(next);
                    }}
                    className={`flex-1 ${fieldClass(highlight, validation, 'goals')} px-3 py-2`}
                    placeholder="מטרת שיקום"
                  />
                  <button
                    type="button"
                    onClick={() => updateGoals(rows.filter((_, j) => j !== i))}
                    className="p-2 text-slate-400 hover:text-red-600 shrink-0"
                    aria-label="מחק מטרה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => updateGoals([...rows, ''])}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  הוסף מטרה
                </button>
              </li>
            </ul>
            <MissingFieldHint show={highlight && goalsMissing} message={INTAKE_ACTIVATION_MISSING_HINT} />
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden ${className}`}
      aria-label="נתוני אינטייק מובנים"
      dir="rtl"
    >
      <div className="flex flex-wrap border-b border-slate-200 bg-white/90">
        {TAB_IDS.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          const active = activeTab === tabId;
          const tabMissing = highlight && isClinicalIntakeTabMissing(validation, tabId);
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={`relative flex-1 min-w-[72px] flex flex-col items-center gap-0.5 py-2.5 px-1 text-[11px] font-semibold transition-colors ${tabButtonClass(
                tabId,
                active,
                highlight,
                validation
              )}`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              <span>{TAB_SHORT[tabId]}</span>
              {tabMissing && (
                <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-purple-600" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      <div className="p-3.5 bg-white">{renderTabContent()}</div>
    </section>
  );
}
