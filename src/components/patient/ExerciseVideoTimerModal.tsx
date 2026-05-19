import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { X, Check } from 'lucide-react';

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split(/[?&#]/)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host.endsWith('youtube.com') || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shorts) return `https://www.youtube-nocookie.com/embed/${shorts[1]}`;
      const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (embed) return `https://www.youtube-nocookie.com/embed/${embed[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

function getVimeoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.includes('vimeo.com')) return null;
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
  } catch {
    return null;
  }
}

function useVideoPresentation(videoUrl: string) {
  return useMemo(() => {
    const t = videoUrl.trim();
    if (!t) return { kind: 'none' as const };
    const yt = getYoutubeEmbedUrl(t);
    if (yt) return { kind: 'iframe' as const, src: yt };
    const vm = getVimeoEmbedUrl(t);
    if (vm) return { kind: 'iframe' as const, src: vm };
    return { kind: 'mp4' as const };
  }, [videoUrl]);
}

export type ModalPainLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ExerciseVideoTimerModalProps {
  open: boolean;
  title: string;
  /** קישור YouTube / Vimeo / קובץ MP4 — מגיע מ־exercise.videoUrl במסד */
  videoUrl: string;
  description?: string | null;
  /** מספר סטים יעד */
  targetSets: number;
  /** תצוגת חזרות / זמן יעד */
  repsLabel: string;
  variant: 'rehab' | 'selfCare';
  /** XP שיוצג בסיום — התשלום בפועל מחושב ב־submitExerciseReport (כולל רצף / ציוד) */
  xpAward: number;
  coinsAward: number;
  primeSeconds?: number;
  /** סגירה ב-X — ללא ענקת XP */
  onClose: () => void;
  /** לחיצה על «סיים תרגול» אחרי טיימר 0 וסימון כל הסטים — פותח מודאל משוב */
  onFinishPractice: () => void;
}

export default function ExerciseVideoTimerModal({
  open,
  title,
  videoUrl,
  description,
  targetSets,
  repsLabel,
  variant,
  xpAward: _xpAward,
  coinsAward: _coinsAward,
  primeSeconds = 30,
  onClose,
  onFinishPractice,
}: ExerciseVideoTimerModalProps) {
  const safeTargetSets = Math.max(1, targetSets);
  const [remaining, setRemaining] = useState(primeSeconds);
  const [timerStarted, setTimerStarted] = useState(false);
  const [checkedSets, setCheckedSets] = useState<boolean[]>(() =>
    Array.from({ length: safeTargetSets }, () => false)
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const presentation = useVideoPresentation(videoUrl);

  const iframeSrc = useMemo(() => {
    if (presentation.kind !== 'iframe') return '';
    const base = presentation.src;
    if (base.includes('youtube-nocookie.com') || base.includes('youtube.com')) {
      return base.includes('?') ? `${base}&rel=0` : `${base}?rel=0`;
    }
    return base;
  }, [presentation]);

  const allSetsChecked = checkedSets.length === safeTargetSets && checkedSets.every(Boolean);
  const completedSetCount = checkedSets.filter(Boolean).length;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearSuccessTimers = useCallback(() => {
    successTimersRef.current.forEach((id) => clearTimeout(id));
    successTimersRef.current = [];
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setRemaining(primeSeconds);
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer, primeSeconds]);

  const tryPlayVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v || !videoUrl.trim()) return;
    v.muted = false;
    v.play().catch(() => {});
  }, [videoUrl]);

  useEffect(() => {
    if (!open) {
      clearTimer();
      clearSuccessTimers();
      setTimerStarted(false);
      return;
    }

    setCheckedSets(Array.from({ length: safeTargetSets }, () => false));
    clearSuccessTimers();
    setTimerStarted(true);
    startTimer();

    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }

    if (presentation.kind === 'mp4') {
      const playId = window.setTimeout(() => tryPlayVideo(), 80);
      return () => clearTimeout(playId);
    }
  }, [
    open,
    clearTimer,
    clearSuccessTimers,
    safeTargetSets,
    startTimer,
    presentation.kind,
    tryPlayVideo,
  ]);

  useEffect(() => {
    return () => {
      clearTimer();
      clearSuccessTimers();
    };
  }, [clearTimer, clearSuccessTimers]);

  const handleClose = useCallback(() => {
    clearTimer();
    clearSuccessTimers();
    onClose();
  }, [clearTimer, clearSuccessTimers, onClose]);

  const toggleSetChecked = useCallback((index: number) => {
    setCheckedSets((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  const handleFinish = useCallback(() => {
    if (remaining > 0 || !timerStarted || !allSetsChecked) return;
    clearTimer();
    clearSuccessTimers();
    onFinishPractice();
  }, [
    remaining,
    timerStarted,
    allSetsChecked,
    onFinishPractice,
    clearTimer,
    clearSuccessTimers,
  ]);

  if (!open) return null;

  const timerRunning = timerStarted && remaining > 0;
  const canFinish = timerStarted && remaining === 0 && allSetsChecked;
  const finishButtonLabel = timerRunning
    ? `סיים תרגול (${remaining} שניות נותרו)`
    : 'סיים תרגול';

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(15, 23, 42, 0.78)' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ex-training-title"
    >
      <div
        className="w-full max-w-[min(96vw,920px)] max-h-[min(96vh,880px)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden min-h-0"
        data-training-variant={variant}
        style={{
          background: '#0f172a',
          borderColor: '#334155',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-700/80 shrink-0 z-40 bg-[#0f172a]">
          <h2
            id="ex-training-title"
            className="text-sm sm:text-base font-bold text-white truncate flex-1 min-w-0"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="סגור בלי לסיים"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
          <div className="shrink-0 border-b border-slate-700/70 bg-[#0f172a]">
            <div className="relative w-full bg-black aspect-video max-h-[min(38vh,320px)] sm:max-h-[min(42vh,360px)] md:max-h-[min(48vh,420px)] mx-auto">
              {presentation.kind === 'iframe' ? (
                <iframe
                  title={title}
                  className="absolute inset-0 w-full h-full border-0"
                  src={iframeSrc}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : presentation.kind === 'mp4' && videoUrl.trim() ? (
                <video
                  ref={videoRef}
                  key={videoUrl}
                  className="absolute inset-0 w-full h-full object-contain"
                  src={videoUrl.trim()}
                  controls
                  playsInline
                  loop
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm px-4 text-center">
                  <p className="text-slate-300">אין סרטון הדגמה</p>
                </div>
              )}
            </div>
          </div>

          <div className="px-3 sm:px-4 pt-6 pb-4 space-y-6 flex flex-col min-h-0">
            {description ? (
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-200 mb-2">
                  הנחיות התרגול
                </h3>
                <div
                  className="rounded-xl px-3 py-3 text-xs sm:text-sm leading-relaxed"
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    color: '#e2e8f0',
                    border: '1px solid #475569',
                  }}
                >
                  {description}
                </div>
              </div>
            ) : null}

            <div
              className="rounded-xl px-3 py-3 space-y-3"
              style={{
                background: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid #475569',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-200">סטים וחזרות</h3>
                <p className="text-xs sm:text-sm text-teal-300 font-semibold tabular-nums">
                  {safeTargetSets} × {repsLabel}
                </p>
              </div>
              <p className="text-[11px] text-slate-400">
                סמנו V לכל סט שהושלם ({completedSetCount}/{safeTargetSets})
              </p>
              <ul className="space-y-2" aria-label="רשימת סטים">
                {checkedSets.map((checked, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => toggleSetChecked(index)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-all touch-manipulation ${
                        checked
                          ? 'border-emerald-500/60 bg-emerald-950/40'
                          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                      }`}
                      aria-pressed={checked}
                      aria-label={`סט ${index + 1}${checked ? ' — הושלם' : ''}`}
                    >
                      <span className="text-sm font-semibold text-slate-200">
                        סט {index + 1}
                        <span className="text-slate-400 font-normal mr-2">· {repsLabel}</span>
                      </span>
                      <span
                        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors ${
                          checked
                            ? 'border-emerald-400 bg-emerald-500 text-white'
                            : 'border-slate-500 bg-slate-700/80 text-slate-500'
                        }`}
                        aria-hidden
                      >
                        <Check className="w-4 h-4" strokeWidth={3} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              disabled={!canFinish}
              onClick={handleFinish}
              className="w-full py-3.5 rounded-xl text-sm font-black transition-all disabled:opacity-35 disabled:cursor-not-allowed disabled:grayscale"
              style={{
                background: canFinish
                  ? 'linear-gradient(135deg, #059669, #0d9488)'
                  : '#475569',
                color: '#fff',
                boxShadow: canFinish ? '0 4px 18px rgba(13, 148, 136, 0.4)' : 'none',
              }}
              aria-live="polite"
            >
              {finishButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
