import { useMemo, useState } from 'react';
import { Activity, Target, Stethoscope, HeartPulse } from 'lucide-react';
import type { PatientClinicalIntakeProfile } from '../../../types';
import type { ClinicalIntakeProfileSlotId } from '../../../utils/clinicalIntakeProfileDisplay';
import {
  isClinicalIntakeNegativeAnswer,
  isClinicalIntakeTextFieldAnswered,
} from '../../../utils/clinicalIntakeFieldAnswers';
import { stripLibraryExerciseIdsFromClinicalText } from '../../../utils/clinicalIntakeClinicalText';
import { parseRomRow, parseStrengthRows } from './intakeReviewUtils';

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

function sanitizeLine(raw: string): string {
  return stripLibraryExerciseIdsFromClinicalText(raw.trim());
}

function isDisplayableValue(v: string): boolean {
  const t = sanitizeLine(v);
  if (!t || !isClinicalIntakeTextFieldAnswered(t)) return false;
  if (isClinicalIntakeNegativeAnswer(t)) return false;
  if (/^(?:טרם|לא נבדק|לא נבחן|—|-|\.)$/i.test(t)) return false;
  if (/^ל["״']?ר\.?$/i.test(t)) return false;
  return true;
}

function isDisplayableRomRow(raw: string): boolean {
  const row = parseRomRow(raw);
  const movement = sanitizeLine(row.movement);
  const value = sanitizeLine(row.value);
  if (!movement && !value) return false;
  if (movement && !value && !isDisplayableValue(movement)) return false;
  if (value && !isDisplayableValue(value) && !/\d|°/.test(value)) return false;
  return Boolean(movement || value);
}

function formatRomDisplayLine(raw: string): string {
  const row = parseRomRow(raw);
  const movement = sanitizeLine(row.movement);
  const value = sanitizeLine(row.value);
  const note = sanitizeLine(row.note);
  if (!movement && !value) return '';
  const base = movement && value ? `${movement}: ${value}` : movement || value;
  return note ? `${base} (${note})` : base;
}

type Props = {
  profile: PatientClinicalIntakeProfile | undefined;
  className?: string;
};

export default function StructuredClinicalIntakeMetricsBar({ profile, className = '' }: Props) {
  const [activeTab, setActiveTab] = useState<ClinicalIntakeProfileSlotId>('medical_history');

  const tabContent = useMemo(() => {
    const p = profile ?? {};
    const bg = sanitizeLine(p.medical_history?.backgroundDiseases ?? '');
    const meds = sanitizeLine(p.medical_history?.chronicMedications ?? '');
    const ranges = (p.ranges ?? []).filter(isDisplayableRomRow).map(formatRomDisplayLine).filter(Boolean);
    const strengthRows = parseStrengthRows(p.muscle_strength)
      .map((r) => ({
        muscle: sanitizeLine(r.muscle),
        grade: sanitizeLine(r.grade),
      }))
      .filter((r) => r.muscle || r.grade)
      .filter((r) => isDisplayableValue(r.muscle) || isDisplayableValue(r.grade));
    const goals = (p.goals ?? []).map(sanitizeLine).filter(isDisplayableValue);

    return {
      medical_history: {
        lines: [
          bg && isDisplayableValue(bg) ? `מחלות רקע: ${bg}` : '',
          meds && isDisplayableValue(meds) ? `תרופות: ${meds}` : '',
        ].filter(Boolean),
        empty: 'אין רקע רפואי מתועד',
      },
      ranges: { lines: ranges, empty: 'טרם הוזנו נתוני ROM' },
      strength: { rows: strengthRows, empty: 'טרם הוזן סיכום כוח' },
      goals: { lines: goals, empty: 'טרם הוגדרו מטרות' },
    };
  }, [profile]);

  const renderPanel = () => {
    switch (activeTab) {
      case 'medical_history':
        return tabContent.medical_history.lines.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-slate-800 leading-relaxed">
            {tabContent.medical_history.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic">{tabContent.medical_history.empty}</p>
        );

      case 'ranges':
        return tabContent.ranges.lines.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-800 leading-relaxed">
            {tabContent.ranges.lines.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-teal-700 shrink-0" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic">{tabContent.ranges.empty}</p>
        );

      case 'strength':
        return tabContent.strength.rows.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-800">
            {tabContent.strength.rows.map((row) => (
              <li key={`${row.muscle}-${row.grade}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{row.muscle || '—'}</span>
                {row.grade && (
                  <span className="text-slate-500 tabular-nums">MMT {row.grade}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic">{tabContent.strength.empty}</p>
        );

      case 'goals':
        return tabContent.goals.lines.length > 0 ? (
          <ol className="space-y-1 text-sm text-slate-800 list-decimal list-inside leading-relaxed">
            {tabContent.goals.lines.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-400 italic">{tabContent.goals.empty}</p>
        );

      default:
        return null;
    }
  };

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden ${className}`}
      aria-label="מדדים מובנים — אינטייק"
      dir="rtl"
    >
      <div className="flex flex-wrap border-b border-slate-200 bg-white/90">
        {TAB_IDS.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          const active = activeTab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={`relative flex-1 min-w-[72px] flex flex-col items-center gap-0.5 py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                active
                  ? 'text-teal-800 bg-teal-50 border-b-2 border-teal-600 -mb-px'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              <span>{TAB_SHORT[tabId]}</span>
            </button>
          );
        })}
      </div>
      <div className="p-3.5 bg-white min-h-[4.5rem]">{renderPanel()}</div>
    </section>
  );
}
