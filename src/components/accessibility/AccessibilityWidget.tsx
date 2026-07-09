import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Accessibility, Minus, Plus, Type } from 'lucide-react';

const STORAGE_KEY = 'physioshield-a11y-prefs-v1';

type FontScale = 'default' | 'lg' | 'xl';

type A11yPrefs = {
  highContrast: boolean;
  fontScale: FontScale;
};

const DEFAULT_PREFS: A11yPrefs = { highContrast: false, fontScale: 'default' };

function readPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>;
    return {
      highContrast: parsed.highContrast === true,
      fontScale:
        parsed.fontScale === 'lg' || parsed.fontScale === 'xl' ? parsed.fontScale : 'default',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: A11yPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function applyPrefs(prefs: A11yPrefs): void {
  const root = document.documentElement;
  if (prefs.highContrast) {
    root.setAttribute('data-a11y-high-contrast', '');
  } else {
    root.removeAttribute('data-a11y-high-contrast');
  }
  if (prefs.fontScale === 'default') {
    root.removeAttribute('data-a11y-font-scale');
  } else {
    root.setAttribute('data-a11y-font-scale', prefs.fontScale);
  }
}

const FONT_SCALE_LABELS: Record<FontScale, string> = {
  default: '100%',
  lg: '112.5%',
  xl: '125%',
};

const FONT_SCALE_ORDER: FontScale[] = ['default', 'lg', 'xl'];

/**
 * Floating accessibility widget for the patient portal.
 * Positioned mid-left to avoid clashing with the bottom navigation bar.
 */
export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(() => readPrefs());

  useEffect(() => {
    applyPrefs(prefs);
    writePrefs(prefs);
  }, [prefs]);

  const toggleContrast = useCallback(() => {
    setPrefs((p) => ({ ...p, highContrast: !p.highContrast }));
  }, []);

  const increaseFont = useCallback(() => {
    setPrefs((p) => {
      const idx = FONT_SCALE_ORDER.indexOf(p.fontScale);
      const next = FONT_SCALE_ORDER[Math.min(idx + 1, FONT_SCALE_ORDER.length - 1)];
      return { ...p, fontScale: next };
    });
  }, []);

  const decreaseFont = useCallback(() => {
    setPrefs((p) => {
      const idx = FONT_SCALE_ORDER.indexOf(p.fontScale);
      const next = FONT_SCALE_ORDER[Math.max(idx - 1, 0)];
      return { ...p, fontScale: next };
    });
  }, []);

  return (
    <div className="fixed top-1/2 -translate-y-1/2 left-0 z-[50]" dir="rtl">
      {open && (
        <div
          className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-56 rounded-xl bg-white border border-slate-200 shadow-xl p-4 space-y-4"
          role="region"
          aria-label="תפריט נגישות"
        >
          <h2 className="text-sm font-bold text-slate-800">הגדרות נגישות</h2>

          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-600">ניגודיות גבוהה</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.highContrast}
              onClick={toggleContrast}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                prefs.highContrast
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {prefs.highContrast ? 'פעיל' : 'כבוי'}
            </button>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Type className="w-3.5 h-3.5" aria-hidden="true" />
              גודל טקסט: {FONT_SCALE_LABELS[prefs.fontScale]}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={decreaseFont}
                disabled={prefs.fontScale === 'default'}
                aria-label="הקטנת טקסט"
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <Minus className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={increaseFont}
                disabled={prefs.fontScale === 'xl'}
                aria-label="הגדלת טקסט"
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <Link
            to="/accessibility"
            className="block text-center text-xs text-teal-700 underline underline-offset-2 hover:text-teal-800 py-1"
          >
            הצהרת נגישות
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="פתיחת תפריט נגישות"
        aria-expanded={open}
        className="flex items-center justify-center w-11 h-14 rounded-r-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
      >
        <Accessibility className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}
