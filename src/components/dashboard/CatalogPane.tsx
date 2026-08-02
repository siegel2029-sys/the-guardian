import { useMemo, useState, type ReactNode } from 'react';
import { Search, BookOpen, Wand2, Check, X, ChevronLeft } from 'lucide-react';
import type { Exercise } from '../../types';
import { bodyAreaLabels } from '../../types';
import { MUSCLE_GROUPS_FILTER } from './planBuilderShared';
import LibraryToggleRow from './LibraryToggleRow';

export interface CatalogPaneProps {
  exerciseLibrary: Exercise[];
  isAddedToLibrary: (libId: string) => boolean;
  findPlanExerciseIdForLibrary: (libId: string) => string | null;
  onAddLibrary: (exercise: Exercise, isOptional: boolean) => void;
  onRemoveLibrary: (planExerciseId: string) => void;
  /** Subtle in-pane cue after library add (parent keeps mobile tab on Catalog). */
  libraryToast?: string | null;
  className?: string;
  /** Compact side pane vs spacious full-catalog modal browser. */
  variant?: 'pane' | 'expanded';
  /** Open dedicated full-catalog modal (pane only). */
  onRequestOpenFullCatalog?: () => void;
  /** Close full-catalog modal (expanded only). */
  onRequestCloseFullCatalog?: () => void;
  /** Open dedicated custom-exercise modal (pane only). */
  onRequestOpenCustom?: () => void;
}

const hideScrollbar =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export default function CatalogPane({
  exerciseLibrary,
  isAddedToLibrary,
  findPlanExerciseIdForLibrary,
  onAddLibrary,
  onRemoveLibrary,
  libraryToast = null,
  className = '',
  variant = 'pane',
  onRequestOpenFullCatalog,
  onRequestCloseFullCatalog,
  onRequestOpenCustom,
}: CatalogPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('הכל');
  const isExpanded = variant === 'expanded';

  const filteredLibrary = useMemo(
    () =>
      exerciseLibrary.filter((ex) => {
        const matchGroup = activeGroup === 'הכל' || ex.muscleGroup === activeGroup;
        const q = searchQuery.trim();
        const areaLabel = bodyAreaLabels[ex.targetArea];
        const matchSearch =
          !q ||
          ex.name.includes(q) ||
          ex.muscleGroup.includes(q) ||
          areaLabel.includes(q);
        return matchGroup && matchSearch;
      }),
    [activeGroup, searchQuery, exerciseLibrary]
  );

  return (
    <aside
      className={`flex flex-col h-full min-h-0 overflow-hidden self-stretch ${
        isExpanded ? 'bg-white' : 'bg-slate-50/80'
      } ${className}`}
      dir="rtl"
      aria-label={isExpanded ? 'קטלוג תרגילים מלא' : 'קטלוג תרגילים'}
    >
      <div
        className={`shrink-0 border-b border-slate-200 bg-white/95 space-y-1.5 ${
          isExpanded ? 'px-4 pt-3 pb-3' : 'px-2.5 pt-2.5 pb-2'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {isExpanded ? (
              <>
                <BookOpen className="w-4 h-4 text-teal-600 shrink-0" aria-hidden />
                <h3 className="text-base font-bold text-slate-800 truncate">קטלוג תרגילים מלא</h3>
                <span className="text-[10px] text-slate-400 shrink-0">
                  ({filteredLibrary.length})
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRequestOpenFullCatalog}
                  className="inline-flex items-center gap-1.5 min-w-0 rounded-lg px-1 py-0.5 -mx-1 text-start hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
                  aria-label="פתח קטלוג מלא"
                  title="פתח קטלוג מלא"
                >
                  <BookOpen className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                  <span className="text-xs font-bold text-slate-800 truncate">קטלוג</span>
                </button>
                <span className="text-[10px] text-slate-400 shrink-0">
                  ({filteredLibrary.length})
                </span>
                {onRequestOpenFullCatalog && (
                  <button
                    type="button"
                    onClick={onRequestOpenFullCatalog}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline-offset-2 hover:underline shrink-0"
                  >
                    פתח קטלוג מלא
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {libraryToast && (
              <div
                className="max-w-[12rem] px-2 py-0.5 rounded-lg flex items-center gap-1 text-[10px] font-semibold truncate"
                style={{
                  background: 'linear-gradient(135deg,#d1fae5,#ccfbf1)',
                  color: '#065f46',
                  border: '1px solid #6ee7b7',
                }}
                role="status"
              >
                <Check className="w-3 h-3 shrink-0" aria-hidden />
                <span className="truncate">{libraryToast}</span>
              </div>
            )}

            {isExpanded && (
              <button
                type="button"
                onClick={onRequestCloseFullCatalog}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
                חזרה לתוכנית
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              placeholder="חיפוש תרגיל…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pr-8 pl-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-teal-400 bg-white ${
                isExpanded ? 'py-2.5' : 'py-1.5'
              }`}
            />
          </div>
          {!isExpanded && onRequestOpenCustom && (
            <button
              type="button"
              onClick={onRequestOpenCustom}
              aria-label="הוסף תרגיל מותאם אישית"
              title="תרגיל מותאם"
              className="shrink-0 inline-flex items-center gap-1 h-[34px] px-2.5 rounded-lg text-xs font-bold transition-all border"
              style={{
                background: 'linear-gradient(135deg,#0d9488,#10b981)',
                borderColor: 'transparent',
                color: 'white',
              }}
            >
              <Wand2 className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">מותאם</span>
            </button>
          )}
        </div>

        <div
          className={`flex flex-row flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain pb-0.5 ${hideScrollbar}`}
          role="toolbar"
          aria-label="סינון לפי קבוצת שרירים"
        >
          {MUSCLE_GROUPS_FILTER.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className="shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-all whitespace-nowrap"
              style={
                activeGroup === g
                  ? { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }
                  : { background: '#f0fffe', color: '#0d9488', border: '1px solid #99f6e4' }
              }
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          data-plan-builder-scroll
          className={`absolute inset-0 overflow-y-auto overscroll-contain pb-4 ${
            isExpanded
              ? 'p-4 space-y-2.5 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0 sm:content-start'
              : 'p-2.5 space-y-2'
          }`}
        >
          {filteredLibrary.length === 0 ? (
            <div
              className={`text-center text-slate-400 py-8 text-sm ${
                isExpanded ? 'sm:col-span-2' : ''
              }`}
            >
              לא נמצאו תרגילים
            </div>
          ) : (
            filteredLibrary.map((ex) => {
              const added = isAddedToLibrary(ex.id);
              const planExId = findPlanExerciseIdForLibrary(ex.id);
              return (
                <LibraryToggleRow
                  key={ex.id}
                  exercise={ex}
                  isAdded={added}
                  onAdd={(isOptional) => onAddLibrary(ex, isOptional)}
                  onRemove={() => {
                    if (planExId) onRemoveLibrary(planExId);
                  }}
                />
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

/** Dedicated modal shell for custom exercise creation (used by ManagePlanModal). */
export function CustomExerciseModalShell({
  children,
  onClose,
  title = 'תרגיל מותאם אישית',
}: {
  children: ReactNode;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5 overscroll-none"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white shadow-2xl w-full max-w-lg max-h-[min(92dvh,840px)] rounded-2xl overflow-hidden flex flex-col min-h-0 border border-teal-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        dir="rtl"
      >
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-teal-50/80 to-white">
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 className="w-4 h-4 text-teal-600 shrink-0" aria-hidden />
            <h2 className="text-sm font-bold text-slate-800 truncate">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div data-plan-builder-scroll className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
          {children}
        </div>
      </div>
    </div>
  );
}
