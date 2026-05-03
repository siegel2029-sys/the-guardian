import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Absolute maximum height of a floating panel in px. */
export const PANEL_MAX_H = 280;
/** Minimum gap between the panel edge and the viewport edge on narrow screens. */
const MOBILE_EDGE_GAP = 8;
/**
 * Height reserved at the bottom of the viewport for the fixed mobile
 * navigation bar (`h-14` = 56px + iOS safe-area headroom).
 * Panels that open downward will never be taller than the space above this
 * boundary, and the flip-upward threshold is measured against it too.
 */
const BOTTOM_NAV_SAFE = 80;
/** Minimum gap between the panel and the very top of the viewport. */
const TOP_EDGE_GAP = 8;

// ─── Position calculator ──────────────────────────────────────────────────────

/**
 * Converts a trigger element's viewport rect into `position: absolute`
 * coordinates relative to `document.body`.
 *
 * Returns a complete `CSSProperties` object including a **computed `maxHeight`**
 * so the caller never has to guess — the panel is always sized to fit the
 * available slot (below *or* above the trigger) without overlapping the fixed
 * mobile bottom navigation bar or the top edge of the viewport.
 *
 * Decision logic
 * ──────────────
 * • `spaceBelow` = distance from the trigger's bottom edge to the top of the
 *   mobile nav safe-area (`vh − BOTTOM_NAV_SAFE`).
 * • `spaceAbove` = distance from the trigger's top edge to the viewport top
 *   (minus a small gap).
 * • Open **upward** when `spaceBelow < PANEL_MAX_H + 4` AND there is more
 *   room above than below.
 * • `maxHeight` is clamped to the actual available slot so the panel never
 *   overflows its chosen direction.
 * • Width is clamped so the panel never overflows the right/left viewport
 *   edge on narrow mobile screens.
 */
export function calcPanelStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Effective bottom of usable viewport (above the mobile nav bar)
  const usableBottom = vh - BOTTOM_NAV_SAFE;

  const spaceBelow = usableBottom - rect.bottom;
  const spaceAbove = rect.top - TOP_EDGE_GAP;

  // Flip upward when there isn't enough room below AND there's more room above
  const openUpward = spaceBelow < PANEL_MAX_H + 4 && spaceAbove > spaceBelow;

  // Clamp width to viewport minus side margins (mobile-safe)
  const width = Math.min(rect.width, vw - MOBILE_EDGE_GAP * 2);

  // Clamp left so the right edge never overflows the viewport
  const left = Math.min(
    rect.left + window.scrollX,
    window.scrollX + vw - width - MOBILE_EDGE_GAP,
  );

  let top: number;
  let maxHeight: number;

  if (openUpward) {
    // Panel grows upward from just above the trigger
    maxHeight = Math.min(PANEL_MAX_H, Math.max(spaceAbove, 120));
    top = rect.top + window.scrollY - maxHeight - 4;
  } else {
    // Panel grows downward, capped at the mobile nav boundary
    maxHeight = Math.min(PANEL_MAX_H, Math.max(spaceBelow - 4, 120));
    top = rect.bottom + window.scrollY + 4;
  }

  return { position: 'absolute', top, left, width, maxHeight, zIndex: 99999 };
}

// ─── PortalDropdown (low-level) ───────────────────────────────────────────────

/**
 * Renders `children` as a floating panel portaled to `document.body`,
 * anchored below (or above) the element referenced by `triggerRef`.
 *
 * - Open/close is **fully controlled** by the parent via `open` / `onClose`.
 * - Repositions the panel on every captured scroll event and window resize so
 *   it tracks the trigger even when the trigger is inside a scrollable pane.
 * - Closes on outside click and Escape key.
 * - Never clipped by `overflow: hidden` ancestors because it lives at the
 *   document body level with `position: absolute` and `zIndex: 99999`.
 */
export function PortalDropdown({
  open,
  onClose,
  triggerRef,
  children,
  panelMaxHeight,
  panelScrollable = true,
  centered = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Ref on the element used as the positioning anchor (typically the trigger button). */
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Override the auto-calculated maxHeight (px). */
  panelMaxHeight?: number;
  /**
   * When false the panel itself is NOT scrollable (`overflow-hidden flex flex-col`)
   * so child elements can own their own scroll regions.  Default: true.
   */
  panelScrollable?: boolean;
  /**
   * Render as a fixed full-screen centred overlay instead of anchoring to the
   * trigger — ideal for large forms that need more than dropdown space.
   */
  centered?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const reposition = useCallback(() => {
    if (triggerRef.current) setPanelStyle(calcPanelStyle(triggerRef.current));
  }, [triggerRef]);

  useEffect(() => {
    if (!open) return;
    if (!centered) reposition();

    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (!centered) {
      // capture:true ensures we receive scroll events from inside nested overflow-y-auto panes
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
    }
    // Outside-click is handled by the backdrop onClick in centered mode, but
    // we still wire Escape for both modes.
    if (!centered) document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);

    return () => {
      if (!centered) {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
        document.removeEventListener('mousedown', onOutside);
      }
      document.removeEventListener('keydown', onKey);
    };
  }, [open, reposition, onClose, triggerRef, centered]);

  if (!open) return null;

  // ── Centred overlay mode ──────────────────────────────────────────────────
  if (centered) {
    return createPortal(
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 99998 }}
          onClick={onClose}
          aria-hidden
        />
        {/* Panel */}
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 520px)',
            maxHeight: panelMaxHeight ? `${panelMaxHeight}px` : '85vh',
            zIndex: 99999,
            overflowY: 'auto',
          }}
          className="rounded-xl border-2 border-slate-200 bg-white shadow-2xl"
        >
          {children}
        </div>
      </>,
      document.body,
    );
  }

  // ── Anchor-based mode ────────────────────────────────────────────────────
  const effectivePanelStyle: CSSProperties = panelMaxHeight
    ? { ...panelStyle, maxHeight: panelMaxHeight }
    : panelStyle;

  return createPortal(
    <div
      ref={panelRef}
      style={effectivePanelStyle}
      className={`rounded-xl border-2 border-slate-200 bg-white shadow-xl ${
        panelScrollable ? 'overflow-y-auto' : 'overflow-hidden flex flex-col'
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── PortalSelect (high-level) ────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Portal-based drop-in replacement for a native `<select>`.
 *
 * The option list is rendered at `document.body` via `PortalDropdown` so it
 * is never clipped by any `overflow: hidden` ancestor — including modals and
 * multi-level flex layouts.  Includes flip-upward logic and mobile edge
 * clamping inherited from `PortalDropdown`.
 *
 * Usage:
 * ```tsx
 * <PortalSelect
 *   value={form.muscleGroup}
 *   onChange={(v) => setForm({ ...form, muscleGroup: v })}
 *   options={GROUPS.map((g) => ({ value: g, label: g }))}
 *   className="rounded-xl border border-slate-200 px-3 py-2"
 * />
 * ```
 */
export function PortalSelect({
  value,
  onChange,
  options,
  className = '',
  dir = 'rtl',
}: {
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  /** Extra classes forwarded to the trigger button (mirrors `<select>` styling). */
  className?: string;
  dir?: 'rtl' | 'ltr';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40 ${className}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        dir={dir}
      >
        <span className="truncate flex-1 text-right">{selectedLabel}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <PortalDropdown
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef as RefObject<HTMLElement | null>}
      >
        <ul role="listbox" dir={dir}>
          {options.map((opt) => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                  opt.value === value ? 'font-semibold text-teal-700' : 'text-slate-800'
                }`}
                dir={dir}
              >
                <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                  {opt.value === value && (
                    <Check className="w-3.5 h-3.5 text-teal-600" aria-hidden />
                  )}
                </span>
                <span className="flex-1 text-right">{opt.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </PortalDropdown>
    </div>
  );
}
