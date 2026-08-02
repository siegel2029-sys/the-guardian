import { useCallback, useEffect, useId, useMemo, useRef, type PointerEvent } from 'react';

export type ClinicalScaleSliderProps = {
  id?: string;
  label: string;
  /** Selected integer, or null when the patient has not chosen yet. */
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Text above the min edge (RTL: right / 0). */
  minAnchor?: string;
  /** Text above the max edge (RTL: left / 10). */
  maxAnchor?: string;
  /** Highlight values at/above this threshold (safety). */
  highRiskFrom?: number;
  className?: string;
};

function clampInt(n: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, n)));
}

/**
 * Clinical VAS / Borg-style continuous slider (RTL: 0 right → max left).
 * Starts with no selection (hidden thumb); first tap places the thumb and commits a value.
 */
export default function ClinicalScaleSlider({
  id: idProp,
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  minAnchor,
  maxAnchor,
  highRiskFrom,
  className = '',
}: ClinicalScaleSliderProps) {
  const reactId = useId();
  const inputId = idProp ?? `clinical-scale-${reactId}`;
  const trackRef = useRef<HTMLInputElement>(null);
  /** Survives the async gap between first pointerdown and React re-render. */
  const committedRef = useRef(value != null);
  const unset = value == null;
  const ticks = useMemo(
    () => Array.from({ length: max - min + 1 }, (_, i) => min + i),
    [min, max]
  );

  useEffect(() => {
    committedRef.current = value != null;
  }, [value]);

  /** Ghost value keeps the native range valid while the thumb stays hidden. */
  const displayValue = value ?? min;

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return min;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return min;
      // RTL clinical convention: 0 at right, max at left.
      const ratioFromRight = (rect.right - clientX) / rect.width;
      return clampInt(min + ratioFromRight * (max - min), min, max);
    },
    [min, max]
  );

  const commit = useCallback(
    (next: number) => {
      committedRef.current = true;
      if (trackRef.current) trackRef.current.value = String(next);
      onChange(next);
    },
    [onChange]
  );

  const commitFromPointer = useCallback(
    (e: PointerEvent<HTMLInputElement>) => {
      if (committedRef.current) return;
      commit(valueFromClientX(e.clientX));
    },
    [commit, valueFromClientX]
  );

  const risky =
    value != null && highRiskFrom != null && value >= highRiskFrom;

  return (
    <div className={`space-y-2 ${className}`} dir="rtl">
      <div className="flex flex-col items-center gap-0.5 text-center">
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-800">
          {label}
        </label>
        <span
          className="text-lg font-bold tabular-nums min-w-[1.75rem]"
          style={{ color: unset ? '#94a3b8' : risky ? '#dc2626' : '#0f766e' }}
          aria-live="polite"
        >
          {unset ? '—' : value}
        </span>
      </div>

      {/* RTL track: 0 on the right → 10 on the left (Hebrew reading flow) */}
      <div dir="rtl" className="select-none">
        {(minAnchor || maxAnchor) && (
          <div className="flex justify-between gap-2 mb-0.5 px-0.5" aria-hidden>
            {/* RTL: first item sits on the right (above 0) */}
            <span className="text-sm text-slate-500 font-medium">{minAnchor ?? ''}</span>
            {/* RTL: last item sits on the left (above 10) */}
            <span className="text-sm text-slate-500 font-medium">{maxAnchor ?? ''}</span>
          </div>
        )}

        <input
          ref={trackRef}
          id={inputId}
          type="range"
          dir="rtl"
          min={min}
          max={max}
          step={1}
          value={displayValue}
          data-unset={unset ? 'true' : 'false'}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={unset ? undefined : value}
          aria-valuetext={
            unset
              ? 'טרם נבחר'
              : value === min && minAnchor
                ? `${value} — ${minAnchor}`
                : value === max && maxAnchor
                  ? `${value} — ${maxAnchor}`
                  : String(value)
          }
          aria-required
          onPointerDown={commitFromPointer}
          onChange={(e) => {
            const next = clampInt(Number(e.target.value), min, max);
            // First keyboard/interaction commit, or ongoing drag after pointerdown.
            if (!committedRef.current) {
              commit(next);
              return;
            }
            onChange(next);
          }}
          className="clinical-vas-slider w-full"
        />

        <div className="flex justify-between mt-1.5 px-0.5" aria-hidden>
          {ticks.map((n) => (
            <div key={n} className="flex flex-col items-center" style={{ width: 0 }}>
              <span
                className="block w-px bg-slate-400"
                style={{ height: n % 5 === 0 ? 8 : 5 }}
              />
              <span
                className={`mt-0.5 text-[11px] tabular-nums leading-none ${
                  n % 5 === 0 ? 'font-semibold text-slate-600' : 'font-medium text-slate-500'
                }`}
              >
                {n}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
