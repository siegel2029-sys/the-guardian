import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  FileText,
  FlaskConical,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import type { PatientClinicalIntakeProfile } from '../../../types';
import StructuredClinicalIntakeMetricsBar from './StructuredClinicalIntakeMetricsBar';
import StructuredClinicalIntakeTabs from './StructuredClinicalIntakeTabs';

export type AiSegmentKey =
  | 'differentialDiagnosis'
  | 'clinicalConclusionsHe'
  | 'precautionsHe'
  | 'recommendedTestsHe'
  | 'redFlags';

const AI_CARD_CONFIG: Record<
  AiSegmentKey,
  {
    title: string;
    icon: LucideIcon;
    placeholder: string;
    addLabel: string;
    multiline: boolean;
    accentClass: string;
  }
> = {
  clinicalConclusionsHe: {
    title: 'מסקנות קליניות',
    icon: Lightbulb,
    placeholder: 'מסקנה קלינית',
    addLabel: '+ מסקנה',
    multiline: true,
    accentClass: 'text-teal-800',
  },
  differentialDiagnosis: {
    title: 'אבחנה מבדלת',
    icon: Stethoscope,
    placeholder: 'חלופה אבחנתית',
    addLabel: '+ חלופה',
    multiline: false,
    accentClass: 'text-indigo-800',
  },
  precautionsHe: {
    title: 'ממה להיזהר',
    icon: AlertTriangle,
    placeholder: 'דגש קליני או אזהרה',
    addLabel: '+ דגש',
    multiline: true,
    accentClass: 'text-amber-800',
  },
  recommendedTestsHe: {
    title: 'המלצות לטיפול',
    icon: FlaskConical,
    placeholder: 'המלצה לטיפול / בדיקה',
    addLabel: '+ המלצה',
    multiline: false,
    accentClass: 'text-slate-800',
  },
  redFlags: {
    title: 'דגלים אדומים',
    icon: ShieldAlert,
    placeholder: 'דגל אדום',
    addLabel: '+ אזהרה',
    multiline: true,
    accentClass: 'text-red-800',
  },
};

function updateListItem(list: string[], index: number, value: string): string[] {
  const next = [...(list.length ? list : [''])];
  next[index] = value;
  return next.filter((s, idx) => s.trim() || idx < next.length - 1 || next.length === 1);
}

function ReportSection({
  title,
  icon: Icon,
  children,
  className = '',
  subtitle,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  subtitle?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      aria-label={title}
    >
      <header className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Icon className="w-5 h-5 text-teal-700 shrink-0" aria-hidden />
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-slate-500 mt-1 leading-snug">{subtitle}</p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

type EditableListCardProps = {
  segmentKey: AiSegmentKey;
  items: string[];
  onChange: (next: string[]) => void;
};

function ReadOnlyAiSegmentCard({ segmentKey, items }: { segmentKey: AiSegmentKey; items: string[] }) {
  const cfg = AI_CARD_CONFIG[segmentKey];
  const Icon = cfg.icon;
  const list = items.map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-2" aria-label={cfg.title}>
      <h4 className={`text-sm font-bold flex items-center gap-2 ${cfg.accentClass}`}>
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {cfg.title}
      </h4>
      {list.length > 0 ? (
        <ul className="space-y-1.5 text-sm text-slate-800 leading-relaxed pr-1">
          {list.map((item, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className={`font-bold shrink-0 text-xs mt-0.5 ${cfg.accentClass}`} aria-hidden>
                •
              </span>
              <span className="flex-1 whitespace-pre-wrap">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400 italic pr-1">—</p>
      )}
    </div>
  );
}

function EditableAiSegmentCard({ segmentKey, items, onChange }: EditableListCardProps) {
  const cfg = AI_CARD_CONFIG[segmentKey];
  const Icon = cfg.icon;
  const list = items.length ? items : [''];

  return (
    <div className="space-y-3" aria-label={cfg.title}>
      <h4 className={`text-sm font-bold flex items-center gap-2 ${cfg.accentClass}`}>
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {cfg.title}
      </h4>
      <ul className="space-y-2">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span
              className={`font-bold mt-2.5 shrink-0 text-xs ${cfg.accentClass}`}
              aria-hidden
            >
              •
            </span>
            {cfg.multiline ? (
              <textarea
                value={item}
                onChange={(e) => onChange(updateListItem(list, i, e.target.value))}
                rows={2}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm leading-relaxed resize-y min-h-[2.75rem] focus:outline-none focus:ring-2 focus:ring-teal-400/25 focus:bg-white"
                placeholder={cfg.placeholder}
              />
            ) : (
              <input
                type="text"
                value={item}
                onChange={(e) => onChange(updateListItem(list, i, e.target.value))}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/25 focus:bg-white"
                placeholder={cfg.placeholder}
              />
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...list, ''])}
        className="text-[11px] font-semibold text-teal-700 hover:underline pr-4"
      >
        {cfg.addLabel}
      </button>
    </div>
  );
}

type VasScoreCardProps = {
  value: number | null;
  onChange: (next: number | null) => void;
};

function VasScoreReadOnly({ value }: { value: number | null }) {
  const display = value != null ? `${value}/10` : '—';
  const painColor =
    value == null ? '#64748b' : value >= 7 ? '#dc2626' : value >= 4 ? '#d97706' : '#0d9488';
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4" aria-label="מדד כאב VAS">
      <p className="text-sm font-bold text-slate-900 mb-1">מדד כאב VAS</p>
      <p className="text-2xl font-black tabular-nums" style={{ color: painColor }}>
        {display}
      </p>
    </div>
  );
}

function VasScoreInline({ value, onChange }: VasScoreCardProps) {
  const display = value != null ? `${value}/10` : '—';
  const painColor =
    value == null ? '#64748b' : value >= 7 ? '#dc2626' : value >= 4 ? '#d97706' : '#0d9488';

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4" aria-label="מדד כאב VAS">
      <label htmlFor="medical-intake-vas-range" className="text-sm font-bold text-slate-900 block mb-2">
        מדד כאב VAS
      </label>
      <div className="flex items-center gap-3">
        <input
          id="medical-intake-vas-range"
          type="range"
          min={0}
          max={10}
          step={1}
          value={value ?? 0}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
          className="flex-1 accent-teal-600"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={value ?? 0}
        />
        <input
          type="number"
          min={0}
          max={10}
          step={1}
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            const n = Number.parseInt(raw, 10);
            if (Number.isFinite(n)) {
              onChange(Math.min(10, Math.max(0, n)));
            }
          }}
          className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-400/25"
          aria-label="ציון VAS מספרי"
        />
        <span className="text-xl font-black tabular-nums min-w-[3rem] text-center" style={{ color: painColor }}>
          {display}
        </span>
      </div>
    </div>
  );
}

type SectionedReportProps = {
  caseStory: string;
  onCaseStoryChange: (next: string) => void;
  vasScore: number | null;
  onVasScoreChange: (next: number | null) => void;
  clinicalDiagnosis: string;
  onClinicalDiagnosisChange: (next: string) => void;
  differentialDiagnosis: string[];
  onDifferentialChange: (next: string[]) => void;
  clinicalConclusionsHe: string[];
  onClinicalConclusionsChange: (next: string[]) => void;
  precautionsHe: string[];
  onPrecautionsChange: (next: string[]) => void;
  recommendedTestsHe: string[];
  onRecommendedTestsChange: (next: string[]) => void;
  redFlags?: string[];
  onRedFlagsChange?: (next: string[]) => void;
  profile?: PatientClinicalIntakeProfile;
  onProfileChange?: (next: PatientClinicalIntakeProfile) => void;
  objectiveEditable?: boolean;
  /** Historical / archive view — no inputs */
  readOnly?: boolean;
  compact?: boolean;
  sourceGemini?: boolean;
  showRedFlags?: boolean;
  /** When false, the legacy AI insights block is omitted (use ClinicalIntelligencePanel instead). */
  showAiInsights?: boolean;
  children?: ReactNode;
  className?: string;
};

/** Vertical sectioned medical chart — narrative, objective findings, then AI insights. */
export function MedicalIntakeSectionedReport({
  caseStory,
  onCaseStoryChange,
  vasScore,
  onVasScoreChange,
  clinicalDiagnosis,
  onClinicalDiagnosisChange,
  differentialDiagnosis,
  onDifferentialChange,
  clinicalConclusionsHe,
  onClinicalConclusionsChange,
  precautionsHe,
  onPrecautionsChange,
  recommendedTestsHe,
  onRecommendedTestsChange,
  redFlags = [],
  onRedFlagsChange,
  profile,
  onProfileChange,
  objectiveEditable = false,
  readOnly = false,
  compact = false,
  sourceGemini = false,
  showRedFlags = false,
  showAiInsights = true,
  children,
  className = '',
}: SectionedReportProps) {
  const aiSegmentOrder: AiSegmentKey[] = showRedFlags
    ? [
        'clinicalConclusionsHe',
        'differentialDiagnosis',
        'precautionsHe',
        'recommendedTestsHe',
        'redFlags',
      ]
    : ['clinicalConclusionsHe', 'differentialDiagnosis', 'precautionsHe', 'recommendedTestsHe'];

  const segmentProps: Record<AiSegmentKey, { items: string[]; onChange: (n: string[]) => void }> = {
    differentialDiagnosis: {
      items: differentialDiagnosis,
      onChange: onDifferentialChange,
    },
    clinicalConclusionsHe: {
      items: clinicalConclusionsHe,
      onChange: onClinicalConclusionsChange,
    },
    precautionsHe: { items: precautionsHe, onChange: onPrecautionsChange },
    recommendedTestsHe: {
      items: recommendedTestsHe,
      onChange: onRecommendedTestsChange,
    },
    redFlags: {
      items: redFlags,
      onChange: onRedFlagsChange ?? (() => undefined),
    },
  };

  return (
    <div className={`space-y-6 ${className}`} dir="rtl">
      <ReportSection
        title="סיכום קליני"
        icon={ClipboardList}
        subtitle="אבחון ראשוני ומדד כאב"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-slate-900 mb-2">אבחון / רושם קליני</p>
            {readOnly ? (
              <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                {clinicalDiagnosis.trim() || '—'}
              </p>
            ) : (
              <input
                id="medical-intake-diagnosis"
                type="text"
                value={clinicalDiagnosis}
                onChange={(e) => onClinicalDiagnosisChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400/25"
                placeholder="רושם קליני / אבחנה עיקרית"
              />
            )}
          </div>
          {readOnly ? (
            <VasScoreReadOnly value={vasScore} />
          ) : (
            <VasScoreInline value={vasScore} onChange={onVasScoreChange} />
          )}
        </div>
      </ReportSection>

      <ReportSection
        title="סיפור המקרה"
        icon={FileText}
        subtitle="סובייקטיבי — תלונה, מנגנון פציעה, מצב נוכחי"
      >
        {readOnly ? (
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap min-h-[6rem]">
            {caseStory.trim() || '—'}
          </p>
        ) : (
          <textarea
            id="medical-intake-case-story"
            value={caseStory}
            onChange={(e) => onCaseStoryChange(e.target.value)}
            rows={compact ? 6 : 8}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/30 px-4 py-3 text-sm text-slate-800 leading-relaxed resize-y min-h-[9rem] focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:bg-white"
            placeholder="תלונת המטופל, מנגנון הפציעה, התנהגות הכאב, הגבלה תפקודית…"
          />
        )}
      </ReportSection>

      <ReportSection
        title="ממצאי בדיקה אובייקטיביים"
        icon={Activity}
        subtitle="ROM, כוח שרירים, בדיקות מיוחדות — נפרד מהסיפור"
      >
        {objectiveEditable && profile && onProfileChange ? (
          <StructuredClinicalIntakeTabs profile={profile} onProfileChange={onProfileChange} />
        ) : (
          <StructuredClinicalIntakeMetricsBar profile={profile} className="border-0 shadow-none bg-transparent" />
        )}
      </ReportSection>

      {children}

      {showAiInsights && (
        <ReportSection
          title="ניתוח AI — השלמות קליניות"
          icon={Stethoscope}
          subtitle="רשימות מובנות — לא מעורבבות בסיפור המקרה"
          className="border-sky-200/80"
        >
          <div className="flex items-center justify-between gap-2 mb-5 pb-3 border-b border-sky-100">
            <p className="text-xs text-sky-900/80 leading-relaxed">
              {readOnly
                ? 'תובנות AI כפי שנשמרו בגרסה זו — לקריאה בלבד.'
                : 'תובנות AI מוצגות כרשימות נפרדות. ניתן לערוך לפני שמירה.'}
            </p>
            {sourceGemini && (
              <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-indigo-100 border border-indigo-200/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                <Sparkles className="w-3 h-3" aria-hidden />
                Gemini
              </span>
            )}
          </div>
          <div className="space-y-6 divide-y divide-slate-100">
            {aiSegmentOrder.map((key) => (
              <div key={key} className="pt-5 first:pt-0">
                {readOnly ? (
                  <ReadOnlyAiSegmentCard segmentKey={key} items={segmentProps[key].items} />
                ) : (
                  <EditableAiSegmentCard
                    segmentKey={key}
                    items={segmentProps[key].items}
                    onChange={segmentProps[key].onChange}
                  />
                )}
              </div>
            ))}
          </div>
        </ReportSection>
      )}
    </div>
  );
}

/** @deprecated Use MedicalIntakeSectionedReport — kept as alias for imports. */
export const MedicalIntakeDashboardGrid = MedicalIntakeSectionedReport;
