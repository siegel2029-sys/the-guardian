import { useMemo, useState } from 'react';
import {
  Activity,
  Target,
  Stethoscope,
  HeartPulse,
  AlertTriangle,
  FlaskConical,
  Dumbbell,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PortalSelect } from '../../ui/PortalDropdown';
import type { BodyArea, Exercise, PatientClinicalIntakeProfile } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { JOINT_BODY_AREAS } from '../../../body/jointBodyAreas';
import {
  buildClinicalIntakeProfileSlots,
  type ClinicalIntakeProfileSlotId,
} from '../../../utils/clinicalIntakeProfileDisplay';
import {
  emptyClinicalProfile,
  formatRomRow,
  formatStrengthRows,
  parseRomRow,
  parseStrengthRows,
  type RomTableRow,
} from './intakeReviewUtils';

const REVIEW_TAB_IDS: ClinicalIntakeProfileSlotId[] = [
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
  const [activeTab, setActiveTab] = useState<ClinicalIntakeProfileSlotId>('medical_history');
  const [painEditorOpen, setPainEditorOpen] = useState(false);

  const slots = useMemo(() => buildClinicalIntakeProfileSlots(profile), [profile]);
  const slotById = useMemo(
    () => Object.fromEntries(slots.map((s) => [s.id, s])) as Record<
      ClinicalIntakeProfileSlotId,
      (typeof slots)[0]
    >,
    [slots]
  );

  const strengthRows = useMemo(
    () => parseStrengthRows(profile.muscle_strength),
    [profile.muscle_strength]
  );

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

  const updateProfile = (patch: Partial<PatientClinicalIntakeProfile>) => {
    onProfileChange({ ...emptyClinicalProfile(), ...profile, ...patch });
  };

  const updateRanges = (ranges: string[]) => updateProfile({ ranges });
  const updateGoals = (goals: string[]) => updateProfile({ goals });

  const updateStrengthFromRows = (rows: { muscle: string; grade: string }[]) => {
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
              </label>
              <textarea
                value={profile.medical_history?.backgroundDiseases ?? ''}
                onChange={(e) =>
                  updateProfile({
                    medical_history: {
                      ...(profile.medical_history ?? {}),
                      backgroundDiseases: e.target.value,
                    },
                  })
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                תרופות קבועות
              </label>
              <textarea
                value={profile.medical_history?.chronicMedications ?? ''}
                onChange={(e) =>
                  updateProfile({
                    medical_history: {
                      ...(profile.medical_history ?? {}),
                      chronicMedications: e.target.value,
                    },
                  })
                }
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
          </div>
        );

      case 'ranges': {
        const rawRows = profile.ranges?.length ? [...profile.ranges] : [''];
        const parsed: RomTableRow[] = rawRows.map(parseRomRow);
        const patchRom = (nextParsed: RomTableRow[]) => {
          updateRanges(
            nextParsed.map(formatRomRow).filter((s, idx, arr) => s.trim() || idx < arr.length - 1)
          );
        };
        return (
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
                  <tr key={i} className="border-b border-slate-100 last:border-0">
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
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
                        className="w-full rounded-lg border border-slate-100 px-2 py-1.5 text-xs text-slate-600"
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
            {!slotById.ranges.hasData && (
              <p className="text-xs text-slate-400 italic mt-2">{slotById.ranges.emptyHe}</p>
            )}
          </div>
        );
      }

      case 'strength':
        return (
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
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-1">
                      <input
                        type="text"
                        value={row.muscle}
                        placeholder="למשל Quadriceps"
                        onChange={(e) => {
                          const next = [...strengthRows];
                          next[i] = { ...next[i], muscle: e.target.value };
                          updateStrengthFromRows(next);
                        }}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
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
                          updateStrengthFromRows(next.length ? next : [{ muscle: '', grade: '' }]);
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
              onClick={() => updateStrengthFromRows([...strengthRows, { muscle: '', grade: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              הוסף שורת כוח
            </button>
          </div>
        );

      case 'goals': {
        const rows = profile.goals?.length ? [...profile.goals] : [''];
        return (
          <ul className="space-y-2">
            {rows.map((goal, i) => (
              <li key={i} className="flex gap-2 items-start">
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = e.target.value;
                    updateGoals(next);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
        );
      }

      default:
        return null;
    }
  };

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

      {/* Inline-editable metric tabs */}
      <section
        className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden"
        aria-label="מדדים מובנים — עריכה ישירה"
      >
        <div className="flex flex-wrap border-b border-slate-200 bg-white/90">
          {REVIEW_TAB_IDS.map((tabId) => {
            const Icon = TAB_ICONS[tabId];
            const slot = slotById[tabId];
            const active = activeTab === tabId;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                className={`flex-1 min-w-[72px] flex flex-col items-center gap-0.5 py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? 'text-teal-800 bg-teal-50 border-b-2 border-teal-600 -mb-px'
                    : slot?.hasData
                      ? 'text-slate-700 hover:bg-slate-50'
                      : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden />
                <span>{TAB_SHORT[tabId]}</span>
              </button>
            );
          })}
        </div>
        <div className="p-3.5 bg-white">{renderTabContent()}</div>
      </section>

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
