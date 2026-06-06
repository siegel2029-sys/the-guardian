import { useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import type { CondensedIntakeSnapshot } from '../../../utils/clinicalIntakeSnapshotCondenser';

type Props = {
  snapshot: CondensedIntakeSnapshot;
  compact?: boolean;
  className?: string;
  title?: string;
  subtitle?: string;
  /** בתוך ClinicalIntakeProfilePanel — ללא מסגרת כפולה */
  embedded?: boolean;
  hideHeader?: boolean;
  hideUnexamined?: boolean;
};

export default function ClinicalIntakeSnapshotPanel({
  snapshot,
  compact = false,
  className = '',
  title = 'תמצית אינטייק קליני',
  subtitle,
  embedded = false,
  hideHeader = false,
  hideUnexamined = false,
}: Props) {
  const [showUnexamined, setShowUnexamined] = useState(false);
  const { sections, unexaminedLabels, hasAnyContent } = snapshot;

  const body = (
    <>
      {!hasAnyContent ? (
        <p className={`text-slate-500 italic ${compact ? 'text-xs' : 'text-sm'}`}>
          אין תמצית נרטיבית — מלאו סיפור אינטייק או הריצו ניתוח AI.
        </p>
      ) : (
        <ul
          className={`space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}
          aria-label="תמצית קלינית"
        >
          {sections.map((section) => (
            <li
              key={section.id}
              className={`rounded-lg px-2.5 py-2 leading-snug ${
                section.emphasis === 'danger'
                  ? 'bg-red-50/90 border border-red-200/80'
                  : 'bg-slate-50/80 border border-slate-100'
              }`}
            >
              <p
                className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
                  section.emphasis === 'danger' ? 'text-red-800' : 'text-slate-500'
                }`}
              >
                {section.titleHe}
              </p>
              <p
                className={
                  section.emphasis === 'danger'
                    ? 'text-red-900 font-medium'
                    : 'text-slate-800'
                }
              >
                {section.text}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!hideUnexamined && unexaminedLabels.length > 0 && (
        <div className="pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowUnexamined((v) => !v)}
            className="text-[11px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
            aria-expanded={showUnexamined}
          >
            נתונים שלא נבדקו ({unexaminedLabels.length})
            {showUnexamined ? (
              <ChevronUp className="inline w-3 h-3 mr-0.5 align-middle" aria-hidden />
            ) : (
              <ChevronDown className="inline w-3 h-3 mr-0.5 align-middle" aria-hidden />
            )}
          </button>
          {showUnexamined && (
            <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
              {unexaminedLabels.join(' · ')}
            </p>
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className={className} dir="rtl">
        {body}
      </div>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      aria-label="תמצית אינטייק קליני"
      dir="rtl"
    >
      {!hideHeader && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 ${
            compact ? 'px-3 py-2' : 'px-4 py-3'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList
              className={`shrink-0 text-teal-700 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
              aria-hidden
            />
            <div className="min-w-0">
              <h3 className={`font-black text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}>{body}</div>
    </section>
  );
}
