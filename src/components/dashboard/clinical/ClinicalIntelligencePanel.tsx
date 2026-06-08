import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Brain,
  ClipboardCheck,
  Lightbulb,
  SearchX,
  Sparkles,
} from 'lucide-react';

type ListSegmentProps = {
  title: string;
  icon: LucideIcon;
  items: string[];
  onChange?: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  accentClass: string;
  readOnly?: boolean;
};

function updateListItem(list: string[], index: number, value: string): string[] {
  const next = [...(list.length ? list : [''])];
  next[index] = value;
  return next.filter((s, idx) => s.trim() || idx < next.length - 1 || next.length === 1);
}

function IntelligenceSegment({
  title,
  icon: Icon,
  items,
  onChange,
  placeholder,
  addLabel,
  accentClass,
  readOnly = false,
}: ListSegmentProps) {
  const list = items.length ? items : [''];
  const visible = list.map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-3" aria-label={title}>
      <h4 className={`text-sm font-bold flex items-center gap-2 ${accentClass}`}>
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {title}
      </h4>
      {readOnly ? (
        visible.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-slate-800 leading-relaxed pr-1">
            {visible.map((item, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className={`font-bold shrink-0 text-xs mt-0.5 ${accentClass}`} aria-hidden>
                  •
                </span>
                <span className="flex-1 whitespace-pre-wrap">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 italic pr-1">—</p>
        )
      ) : (
        <>
          <ul className="space-y-2">
            {list.map((item, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className={`font-bold mt-2.5 shrink-0 text-xs ${accentClass}`} aria-hidden>
                  •
                </span>
                <textarea
                  value={item}
                  onChange={(e) => onChange?.(updateListItem(list, i, e.target.value))}
                  rows={2}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm leading-relaxed resize-y min-h-[2.75rem] focus:outline-none focus:ring-2 focus:ring-violet-400/25 focus:bg-white"
                  placeholder={placeholder}
                />
              </li>
            ))}
          </ul>
          {onChange && (
            <button
              type="button"
              onClick={() => onChange([...list, ''])}
              className="text-[11px] font-semibold text-violet-700 hover:underline pr-4"
            >
              {addLabel}
            </button>
          )}
        </>
      )}
    </div>
  );
}

type Props = {
  clinicalConclusionsHe: string[];
  onClinicalConclusionsChange?: (next: string[]) => void;
  redFlags: string[];
  onRedFlagsChange?: (next: string[]) => void;
  recommendedTestsHe: string[];
  onRecommendedTestsChange?: (next: string[]) => void;
  discrepancies?: string[];
  readOnly?: boolean;
  sourceGemini?: boolean;
  className?: string;
};

/** Dedicated Clinical Intelligence section — מסקנות, אזהרות, בדיקות, מה התפספס */
export default function ClinicalIntelligencePanel({
  clinicalConclusionsHe,
  onClinicalConclusionsChange,
  redFlags,
  onRedFlagsChange,
  recommendedTestsHe,
  onRecommendedTestsChange,
  discrepancies = [],
  readOnly = false,
  sourceGemini = false,
  className = '',
}: Props) {
  const missedItems = discrepancies.map((s) => s.trim()).filter(Boolean);

  return (
    <section
      className={`rounded-xl border border-violet-200 bg-gradient-to-l from-violet-50/40 to-white shadow-sm overflow-hidden ${className}`}
      aria-label="אינטליגנציה קלינית"
      dir="rtl"
    >
      <header className="px-5 py-3.5 border-b border-violet-100 bg-violet-50/60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-700 shrink-0" aria-hidden />
            אינטליגנציה קלינית
          </h3>
          {sourceGemini && (
            <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-indigo-100 border border-indigo-200/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
              <Sparkles className="w-3 h-3" aria-hidden />
              Gemini
            </span>
          )}
        </div>
        <p className="text-[11px] text-violet-900/70 mt-1 leading-snug">
          מסקנות, אזהרות, בדיקות מומלצות ופערים — נפרד מסיפור המקרה
        </p>
      </header>

      <div className="p-5 space-y-6 divide-y divide-violet-100">
        <div className="pt-0">
          <IntelligenceSegment
            title="מסקנות ושינויים"
            icon={Lightbulb}
            items={clinicalConclusionsHe}
            onChange={onClinicalConclusionsChange}
            placeholder="מסקנה או שינוי קליני"
            addLabel="+ מסקנה"
            accentClass="text-teal-800"
            readOnly={readOnly}
          />
        </div>

        <div className="pt-5">
          <IntelligenceSegment
            title="אזהרות (DANGER)"
            icon={AlertTriangle}
            items={redFlags}
            onChange={onRedFlagsChange}
            placeholder="דגל אדום / סיכון קליני"
            addLabel="+ אזהרה"
            accentClass="text-red-800"
            readOnly={readOnly}
          />
        </div>

        <div className="pt-5">
          <IntelligenceSegment
            title="בדיקות מומלצות"
            icon={ClipboardCheck}
            items={recommendedTestsHe}
            onChange={onRecommendedTestsChange}
            placeholder="בדיקה או המלצה לטיפול"
            addLabel="+ בדיקה"
            accentClass="text-slate-800"
            readOnly={readOnly}
          />
        </div>

        <div className="pt-5">
          <IntelligenceSegment
            title="מה התפספס"
            icon={SearchX}
            items={missedItems.length ? missedItems : ['']}
            placeholder="פער או מידע חסר"
            addLabel="+ פער"
            accentClass="text-amber-800"
            readOnly
          />
        </div>
      </div>
    </section>
  );
}
