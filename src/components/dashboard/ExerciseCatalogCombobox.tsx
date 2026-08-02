import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import type { Exercise } from '../../types';
import { bodyAreaLabels } from '../../types';
import { useExerciseCatalog } from '../../hooks/useExerciseCatalog';
import { calcPanelStyle } from '../ui/PortalDropdown';

const MAX_SUGGESTIONS = 12;

export interface ExerciseCatalogComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired when therapist picks a catalog match — parent should autofill fields. */
  onSelectCatalog: (exercise: Exercise) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  error?: boolean;
  disabled?: boolean;
  /** Characters required before the dropdown opens. Default 1. */
  minChars?: number;
  required?: boolean;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function matchesCatalogExercise(ex: Exercise, q: string): boolean {
  if (!q) return false;
  const name = ex.name.toLowerCase();
  const muscle = ex.muscleGroup.toLowerCase();
  const area = (bodyAreaLabels[ex.targetArea] ?? '').toLowerCase();
  return name.includes(q) || muscle.includes(q) || area.includes(q);
}

export default function ExerciseCatalogCombobox({
  id: idProp,
  value,
  onChange,
  onSelectCatalog,
  label,
  placeholder = 'הקלידו לחיפוש בקטלוג או שם מותאם…',
  maxLength = 60,
  className = '',
  inputClassName = '',
  error = false,
  disabled = false,
  minChars = 1,
  required = false,
}: ExerciseCatalogComboboxProps) {
  const reactId = useId();
  const inputId = idProp ?? `exercise-catalog-combobox-${reactId}`;
  const listboxId = `${inputId}-listbox`;

  const { activeExercises, loading } = useExerciseCatalog({ includeInactive: false });

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** True after ↑/↓ — Enter then commits a suggestion; otherwise Enter keeps free-text. */
  const [navigatedByKeyboard, setNavigatedByKeyboard] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const query = normalizeQuery(value);
  const showSuggestions = open && !disabled && query.length >= minChars;

  const suggestions = useMemo(() => {
    if (query.length < minChars) return [];
    const ranked = activeExercises
      .filter((ex) => matchesCatalogExercise(ex, query))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(query) ? 0 : 1;
        const bStarts = bName.startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return aName.localeCompare(bName, 'he');
      });
    return ranked.slice(0, MAX_SUGGESTIONS);
  }, [activeExercises, query, minChars]);

  const reposition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const base = calcPanelStyle(el);
    setPanelStyle({
      ...base,
      zIndex: 100_050,
      maxHeight: Math.min(240, Number(base.maxHeight) || 240),
    });
  }, []);

  useLayoutEffect(() => {
    if (!showSuggestions) return;
    reposition();
  }, [showSuggestions, suggestions.length, value, reposition]);

  useEffect(() => {
    if (!showSuggestions) return;
    const onScrollOrResize = () => reposition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [showSuggestions, reposition]);

  useEffect(() => {
    setHighlight(0);
    setNavigatedByKeyboard(false);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const commitSelection = useCallback(
    (ex: Exercise) => {
      onSelectCatalog(ex);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onSelectCatalog]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        // Free-text: keep custom name, close list if open.
        setOpen(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNavigatedByKeyboard(true);
      setHighlight((i) => Math.min(suggestions.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNavigatedByKeyboard(true);
      setHighlight((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      // Without prior arrow navigation, keep free-text custom name.
      if (!navigatedByKeyboard) {
        setOpen(false);
        return;
      }
      e.preventDefault();
      const pick = suggestions[highlight];
      if (pick) commitSelection(pick);
      return;
    }
  };

  const defaultInputClass = `w-full ps-9 pe-3 py-2 text-sm font-semibold rounded-xl border bg-white text-slate-800 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/25 ${
    error ? 'border-red-400' : 'border-slate-200'
  }`;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`} dir="rtl">
      {label ? (
        <label htmlFor={inputId} className="text-xs font-medium text-slate-600 mb-1 block">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
      ) : null}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showSuggestions && suggestions[highlight]
              ? `${listboxId}-opt-${highlight}`
              : undefined
          }
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value.slice(0, maxLength));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={inputClassName || defaultInputClass}
        />
        <Search
          className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
          aria-hidden
        />
      </div>

      {showSuggestions &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="הצעות מקטלוג התרגילים"
            data-scroll-lock-allow
            style={panelStyle}
            className="m-0 list-none overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-md"
          >
            {suggestions.length === 0 ? (
              <li className="px-3 py-2.5 text-xs text-slate-500" role="presentation">
                {loading ? 'טוען קטלוג…' : 'אין התאמות בקטלוג — אפשר להמשיך עם שם מותאם'}
              </li>
            ) : (
              suggestions.map((ex, index) => {
                const active = index === highlight;
                return (
                  <li
                    key={ex.id}
                    id={`${listboxId}-opt-${index}`}
                    role="option"
                    aria-selected={active}
                    className={`cursor-pointer px-3 py-2 transition-colors ${
                      active ? 'bg-teal-50' : 'hover:bg-slate-50'
                    }`}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(e) => {
                      // Prevent input blur before click registers.
                      e.preventDefault();
                      commitSelection(ex);
                    }}
                  >
                    <p
                      className={`text-sm font-semibold truncate ${
                        active ? 'text-teal-900' : 'text-slate-800'
                      }`}
                    >
                      {ex.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {ex.muscleGroup}
                      <span className="text-slate-300 mx-1" aria-hidden>
                        ·
                      </span>
                      {bodyAreaLabels[ex.targetArea]}
                    </p>
                  </li>
                );
              })
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}
