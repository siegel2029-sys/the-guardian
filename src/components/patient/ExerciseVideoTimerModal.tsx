import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { X, Play, ChevronDown } from 'lucide-react';

const EFFORT_LABELS: Record<number, string> = {
  1: 'קל מאוד',
  2: 'קל',
  3: 'בינוני',
  4: 'קשה',
  5: 'קשה מאוד (מקסימום)',
};

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

export interface ExerciseTrainingCompletePayload {
  effort: 1 | 2 | 3 | 4 | 5;
  /** רמת כאב לדיווח למטפל (1–10) */
  painLevel: ModalPainLevel;
}

const DEFAULT_CLINICAL_REGRESSION =
  'אם קשה מדי: הקטינו טווח תנועה, האטו, או הפחיתו חזרות/סטים. אם כאב מעל 4/10 — העדיפו הקלה מובנית.';
const DEFAULT_CLINICAL_PROGRESSION =
  'אם קל מדי: תאמו עם המטפל להגדלת זמן החזקה, טווח, נפח או התנגדות.';

export interface ExerciseVideoTimerModalProps {
  open: boolean;
  title: string;
  /** קישור YouTube / Vimeo / קובץ MP4 — מגיע מ־exercise.videoUrl במסד */
  videoUrl: string;
  description?: string | null;
  /** רגרסיה / התקדמות — מתוך המסד או ברירת מחדל */
  clinicalRegressionHint?: string | null;
  clinicalProgressionHint?: string | null;
  variant: 'rehab' | 'selfCare';
  /** XP שיוצג בסיום — התשלום בפועל מחושב ב־submitExerciseReport (כולל רצף / ציוד) */
  xpAward: number;
  coinsAward: number;
  primeSeconds?: number;
  /** סגירה ב-X — ללא ענקת XP */
  onClose: () => void;
  /** לחיצה על «סיים תרגול» אחרי טיימר 0 — מעדכן PatientContext */
  onComplete: (payload: ExerciseTrainingCompletePayload) => void;
  /** מזהה תרגיל שיקום — נשלח ל־onTimerStarted כשמפעילים טיימר */
  timerArmExerciseId?: string;
  /** נקרא כשהמשתמש מפעיל את הטיימר («התחל תרגול») */
  onTimerStarted?: (exerciseId: string) => void;
}

export default function ExerciseVideoTimerModal({
  open,
  title,
  videoUrl,
  description,
  clinicalRegressionHint,
  clinicalProgressionHint,
  variant,
  xpAward: _xpAward,
  coinsAward: _coinsAward,
  primeSeconds = 30,
  onClose,
  onComplete,
  timerArmExerciseId,
  onTimerStarted,
}: ExerciseVideoTimerModalProps) {
  const [remaining, setRemaining] = useState(primeSeconds);
  const [timerStarted, setTimerStarted] = useState(false);
  const [effort, setEffort] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [painLevel, setPainLevel] = useState<ModalPainLevel>(3);
  const [clinicalAdviceOpen, setClinicalAdviceOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const presentation = useVideoPresentation(videoUrl);

  const regressionText = useMemo(
    () =>
      (clinicalRegressionHint && clinicalRegressionHint.trim()) || DEFAULT_CLINICAL_REGRESSION,
    [clinicalRegressionHint]
  );
  const progressionText = useMemo(
    () =>
      (clinicalProgressionHint && clinicalProgressionHint.trim()) || DEFAULT_CLINICAL_PROGRESSION,
    [clinicalProgressionHint]
  );

  const iframeSrc = useMemo(() => {
    if (presentation.kind !== 'iframe') return '';
    const base = presentation.src;
    if (base.includes('youtube-nocookie.com') || base.includes('youtube.com')) {
      return base.includes('?') ? `${base}&rel=0` : `${base}?rel=0`;
    }
    return base;
  }, [presentation]);

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
      return;
    }
    setEffort(3);
    setPainLevel(3);
    setClinicalAdviceOpen(false);
    setTimerStarted(false);
    setRemaining(primeSeconds);
    clearTimer();
    clearSuccessTimers();
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [open, clearTimer, clearSuccessTimers, primeSeconds, videoUrl]);

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

  const handleStartExercise = useCallback(() => {
    setTimerStarted(true);
    startTimer();
    if (timerArmExerciseId && onTimerStarted) {
      onTimerStarted(timerArmExerciseId);
    }
    if (presentation.kind === 'mp4') {
      window.setTimeout(() => tryPlayVideo(), 80);
    }
  }, [startTimer, tryPlayVideo, presentation.kind, timerArmExerciseId, onTimerStarted]);

  const handleRestartTimer = useCallback(() => {
    setTimerStarted(true);
    startTimer();
    if (presentation.kind === 'mp4') tryPlayVideo();
  }, [startTimer, tryPlayVideo, presentation.kind]);

  const handleFinish = useCallback(() => {
    if (remaining > 0 || !timerStarted) return;
    onComplete({
      effort,
      painLevel,
    });
    clearTimer();
    clearSuccessTimers();
    onCloseRef.current();
  }, [remaining, timerStarted, effort, painLevel, onComplete, clearSuccessTimers, clearTimer]);

  if (!open) return null;

  const canFinish = timerStarted && remaining === 0;

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
          <div className="sticky top-0 z-30 shrink-0 border-b border-slate-700/70 bg-[#0f172a] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.55)]">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm px-4 text-center">
                  <p className="font-semibold text-slate-300 mb-1">אין סרטון הדגמה</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    הוסיפו <code className="text-teal-400/90">videoUrl</code> למסד התרגילים (YouTube, Vimeo או MP4).
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="px-3 sm:px-4 py-3 space-y-3 flex flex-col min-h-0">
              {description ? (
                <div
                  className="rounded-xl px-3 py-2.5 text-xs sm:text-sm leading-relaxed max-h-32 overflow-y-auto"
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    color: '#e2e8f0',
                    border: '1px solid #475569',
                  }}
                >
                  {description}
                </div>
              ) : null}

              <div
                className="rounded-xl overflow-hidden text-[11px] sm:text-xs leading-relaxed"
                style={{
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setClinicalAdviceOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right hover:bg-slate-800/40 transition-colors"
                  aria-expanded={clinicalAdviceOpen}
                  id="clinical-advice-toggle"
                >
                  <span className="font-semibold text-sky-200/95 text-xs sm:text-sm">
                    לחץ כאן לעצה מקצועית מגורדי
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-sky-300/90 transition-transform duration-200 ${
                      clinicalAdviceOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>
                {clinicalAdviceOpen ? (
                  <div
                    className="px-3 pb-2.5 pt-0 space-y-2 border-t border-slate-600/50"
                    role="region"
                    aria-labelledby="clinical-advice-toggle"
                  >
                    {painLevel > 4 ? (
                      <p className="text-amber-200/90 font-semibold border-b border-slate-600/60 pb-2 pt-2">
                        לפי רמת הכאב שבחרתם: מעל 4/10 מומלץ לשקול רגרסיה, הקטנת טווח, ומנוחה קצרה לפני
                        המשך.
                      </p>
                    ) : null}
                    <div>
                      <p className="font-semibold text-emerald-200/90 mb-0.5">אם קשה מדי (רגרסיה)</p>
                      <p className="text-slate-300">{regressionText}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-teal-200/90 mb-0.5">אם קל מדי (התקדמות)</p>
                      <p className="text-slate-300">{progressionText}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!timerStarted ? (
                  <button
                    type="button"
                    onClick={handleStartExercise}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #0d9488, #059669)',
                      boxShadow: '0 4px 18px rgba(13, 148, 136, 0.45)',
                    }}
                  >
                    <Play className="w-4 h-4 shrink-0 fill-current" />
                    התחל תרגול
                  </button>
                ) : remaining > 0 ? (
                  <button
                    type="button"
                    onClick={handleRestartTimer}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all border border-slate-600"
                    style={{
                      background: 'rgba(30, 41, 59, 0.95)',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                    }}
                  >
                    <Play className="w-4 h-4 shrink-0 fill-current" />
                    התחל מחדש
                  </button>
                ) : null}
                <span className="text-[11px] text-slate-500 leading-snug">
                  {!timerStarted
                    ? 'הטיימר מתחיל רק אחרי לחיצה על «התחל תרגול».'
                    : remaining > 0
                      ? 'ניתן לאפס את הספירה ולהתחיל שוב בכל עת.'
                      : 'לחצו «סיים תרגול» כדי לשמור ולחזור לרשימת האימונים.'}
                </span>
              </div>

              <div
                className="rounded-xl px-3 py-3 text-center"
                style={{
                  background: 'rgba(30, 41, 59, 0.95)',
                  border: '1px solid #475569',
                }}
              >
                <span className="tabular-nums text-2xl sm:text-3xl font-black text-teal-300">
                  {remaining}
                </span>
                <span className="text-slate-400 mr-2 text-sm">שניות נותרו</span>
                {!timerStarted ? (
                  <p className="text-[11px] text-slate-500 mt-1">לחצו «התחל תרגול» כדי להתחיל ספירה לאחור</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  רמת כאב · {painLevel}/10
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={painLevel}
                  onChange={(e) =>
                    setPainLevel(Number(e.target.value) as ModalPainLevel)
                  }
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  style={{ background: '#334155' }}
                />
                <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  מאמץ (Borg / RPE) · {effort}/5 — {EFFORT_LABELS[effort]}
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={effort}
                  onChange={(e) =>
                    setEffort(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                  }
                  className="w-full h-2.5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  style={{ background: '#334155' }}
                />
                <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
              </div>

              <p className="text-[11px] text-center text-slate-500 leading-relaxed">
                «סיים תרגול» יופעל רק לאחר סיום הטיימר. סגירת החלון (×) לא שומרת התקדמות.
              </p>

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
              >
                סיים תרגול
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}
