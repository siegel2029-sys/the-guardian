import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { X, Check, Play } from 'lucide-react';
import type { BodyArea } from '../../types';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  getVideoIframeSrc,
  useVideoPresentation,
} from '../../utils/exerciseVideoPresentation';
import {
  getLateralSideLabels,
  requiresExerciseLateralization,
  type LateralSide,
} from '../../utils/exerciseLateralization';

/** Post-workout VAS pain — clinical 0–10 (aligned with `PainLevel`). */
export type ModalPainLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

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
  /** משך החזקה לסט (שניות) — לטיימר inline ולתרגילי זמן */
  holdSeconds?: number;
  /** true = «סטים × זמן» (לא חזרות) */
  isTimeBased?: boolean;
  targetArea?: BodyArea;
  muscleGroup?: string;
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

function emptySetFlags(count: number): boolean[] {
  return Array.from({ length: count }, () => false);
}

export default function ExerciseVideoTimerModal({
  open,
  title,
  videoUrl,
  description,
  targetSets,
  repsLabel,
  holdSeconds = 0,
  isTimeBased = false,
  targetArea,
  muscleGroup,
  variant,
  xpAward: _xpAward,
  coinsAward: _coinsAward,
  primeSeconds = 30,
  onClose,
  onFinishPractice,
}: ExerciseVideoTimerModalProps) {
  // Imperative lock (in addition to GlobalModalScrollLock via aria-modal) —
  // freezes patient-portal background scroll on iOS during active workout.
  useBodyScrollLock(open);

  const safeTargetSets = Math.max(1, targetSets);
  const [remaining, setRemaining] = useState(primeSeconds);
  const [timerStarted, setTimerStarted] = useState(false);
  const [activeSide, setActiveSide] = useState<LateralSide>('right');
  const [checkedSetsRight, setCheckedSetsRight] = useState<boolean[]>(() =>
    emptySetFlags(safeTargetSets)
  );
  const [checkedSetsLeft, setCheckedSetsLeft] = useState<boolean[]>(() =>
    emptySetFlags(safeTargetSets)
  );
  const [activeSetTimerKey, setActiveSetTimerKey] = useState<string | null>(null);
  const [setTimerRemaining, setSetTimerRemaining] = useState(0);
  /** Tracks which URL last failed — auto-clears when `videoUrl` changes (no effect needed). */
  const [failedVideoUrl, setFailedVideoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timerEndAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerEndAudioUnlockedRef = useRef(false);
  const prevSetTimerRemainingRef = useRef(0);
  const setTimerFinishedNaturallyRef = useRef(false);

  const primeTimerEndAudioFromUserGesture = useCallback(() => {
    if (!timerEndAudioRef.current) {
      timerEndAudioRef.current = new Audio('/sounds/timer-end.mp3');
      timerEndAudioRef.current.preload = 'auto';
    }

    if (timerEndAudioUnlockedRef.current) return;

    const audio = timerEndAudioRef.current;
    const previousVolume = audio.volume;
    audio.volume = 0.001;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        timerEndAudioUnlockedRef.current = true;
      })
      .catch((err) => console.error('Timer audio unlock failed:', err))
      .finally(() => {
        if (!timerEndAudioUnlockedRef.current) {
          audio.volume = previousVolume;
        }
      });
  }, []);

  const playTimerEndSound = useCallback(() => {
    const audio = timerEndAudioRef.current;
    if (!audio) {
      console.error(
        'Timer audio playback failed: Audio was not initialized — tap anywhere inside the exercise modal first.'
      );
      return;
    }
    audio.currentTime = 0;
    audio.volume = 1;
    void audio
      .play()
      .catch((err) => console.error('Timer audio playback failed:', err));
  }, []);

  const presentation = useVideoPresentation(videoUrl);
  const iframeSrc = useMemo(() => getVideoIframeSrc(presentation), [presentation]);
  const trimmedVideoUrl = videoUrl.trim();
  const hasVideoUrl = trimmedVideoUrl.length > 0;
  const videoLoadError = hasVideoUrl && failedVideoUrl === trimmedVideoUrl;

  const lateralizationRequired = useMemo(
    () =>
      requiresExerciseLateralization({
        name: title,
        instructions: description,
      }),
    [title, description]
  );

  const sideLabels = useMemo(
    () => getLateralSideLabels(targetArea, muscleGroup),
    [targetArea, muscleGroup]
  );

  const perSetHoldSeconds = isTimeBased && holdSeconds > 0 ? holdSeconds : 0;
  const showPerSetTimer = perSetHoldSeconds > 0;

  const checkedSetsForActiveSide =
    activeSide === 'right' ? checkedSetsRight : checkedSetsLeft;

  const completedRightCount = checkedSetsRight.filter(Boolean).length;
  const completedLeftCount = checkedSetsLeft.filter(Boolean).length;

  const allSetsChecked = lateralizationRequired
    ? checkedSetsRight.every(Boolean) && checkedSetsLeft.every(Boolean)
    : checkedSetsRight.every(Boolean);

  const completedSetCount = lateralizationRequired
    ? completedRightCount + completedLeftCount
    : completedRightCount;

  const totalSetSlots = lateralizationRequired ? safeTargetSets * 2 : safeTargetSets;

  const clearSessionTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearSetTimer = useCallback(() => {
    if (setTimerIntervalRef.current) {
      clearInterval(setTimerIntervalRef.current);
      setTimerIntervalRef.current = null;
    }
    setTimerFinishedNaturallyRef.current = false;
    setActiveSetTimerKey(null);
    setSetTimerRemaining(0);
  }, []);

  const clearSuccessTimers = useCallback(() => {
    successTimersRef.current.forEach((id) => clearTimeout(id));
    successTimersRef.current = [];
  }, []);

  const startSessionTimer = useCallback(() => {
    clearSessionTimer();
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
  }, [clearSessionTimer, primeSeconds]);

  const startSetTimer = useCallback(
    (timerKey: string) => {
      primeTimerEndAudioFromUserGesture();
      clearSetTimer();
      setActiveSetTimerKey(timerKey);
      setSetTimerRemaining(perSetHoldSeconds);
      setTimerIntervalRef.current = setInterval(() => {
        setSetTimerRemaining((prev) => {
          if (prev <= 1) {
            if (setTimerIntervalRef.current) {
              clearInterval(setTimerIntervalRef.current);
              setTimerIntervalRef.current = null;
            }
            setActiveSetTimerKey(null);
            setTimerFinishedNaturallyRef.current = true;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearSetTimer, perSetHoldSeconds, primeTimerEndAudioFromUserGesture]
  );

  const tryPlayVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v || !videoUrl.trim()) return;
    v.muted = false;
    v.play().catch(() => {});
  }, [videoUrl]);

  useEffect(() => {
    if (!open) {
      clearSessionTimer();
      clearSetTimer();
      clearSuccessTimers();
      setTimerStarted(false);
      timerEndAudioRef.current = null;
      timerEndAudioUnlockedRef.current = false;
      prevSetTimerRemainingRef.current = 0;
      setTimerFinishedNaturallyRef.current = false;
      return;
    }

    setCheckedSetsRight(emptySetFlags(safeTargetSets));
    setCheckedSetsLeft(emptySetFlags(safeTargetSets));
    setActiveSide('right');
    clearSetTimer();
    clearSuccessTimers();
    setTimerStarted(true);
    startSessionTimer();

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
    clearSessionTimer,
    clearSetTimer,
    clearSuccessTimers,
    primeSeconds,
    safeTargetSets,
    startSessionTimer,
    presentation.kind,
    tryPlayVideo,
  ]);

  useEffect(() => {
    if (!open) {
      prevSetTimerRemainingRef.current = 0;
      return;
    }
    if (
      setTimerFinishedNaturallyRef.current &&
      prevSetTimerRemainingRef.current > 0 &&
      setTimerRemaining === 0
    ) {
      setTimerFinishedNaturallyRef.current = false;
      playTimerEndSound();
    }
    prevSetTimerRemainingRef.current = setTimerRemaining;
  }, [open, setTimerRemaining, playTimerEndSound]);

  useEffect(() => {
    return () => {
      clearSessionTimer();
      clearSetTimer();
      clearSuccessTimers();
    };
  }, [clearSessionTimer, clearSetTimer, clearSuccessTimers]);

  const handleClose = useCallback(() => {
    clearSessionTimer();
    clearSetTimer();
    clearSuccessTimers();
    onClose();
  }, [clearSessionTimer, clearSetTimer, clearSuccessTimers, onClose]);

  const toggleSetChecked = useCallback(
    (side: LateralSide, index: number) => {
      const setter = side === 'right' ? setCheckedSetsRight : setCheckedSetsLeft;
      setter((prev) => {
        const next = [...prev];
        next[index] = !next[index];
        return next;
      });
    },
    []
  );

  const handleFinish = useCallback(() => {
    if (remaining > 0 || !timerStarted || !allSetsChecked) return;
    clearSessionTimer();
    clearSetTimer();
    clearSuccessTimers();
    onFinishPractice();
  }, [
    remaining,
    timerStarted,
    allSetsChecked,
    onFinishPractice,
    clearSessionTimer,
    clearSetTimer,
    clearSuccessTimers,
  ]);

  if (!open) return null;

  const timerRunning = timerStarted && remaining > 0;
  const canFinish = timerStarted && remaining === 0 && allSetsChecked;
  const finishButtonLabel = timerRunning
    ? `סיים תרגול (${remaining} שניות נותרו)`
    : 'סיים תרגול';

  const renderSetRow = (side: LateralSide, index: number, checked: boolean) => {
    const timerKey = `${side}-${index}`;
    const timerActive = activeSetTimerKey === timerKey && setTimerRemaining > 0;

    return (
      <li key={timerKey}>
        <div
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${
            checked
              ? 'border-emerald-500/60 bg-emerald-950/40'
              : 'border-slate-600 bg-slate-800/50'
          }`}
        >
          <button
            type="button"
            onClick={() => toggleSetChecked(side, index)}
            className="flex-1 min-w-0 flex items-center justify-between gap-3 px-1 py-1 rounded-md touch-manipulation text-right"
            aria-pressed={checked}
            aria-label={`${sideLabels[side]} — סט ${index + 1}${checked ? ' — הושלם' : ''}`}
          >
            <span className="text-sm font-semibold text-slate-200 truncate">
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

          {showPerSetTimer && (
            <button
              type="button"
              onClick={() => startSetTimer(timerKey)}
              disabled={timerActive}
              className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border transition-all touch-manipulation ${
                timerActive
                  ? 'border-teal-400 bg-teal-900/60 text-teal-200'
                  : 'border-slate-500 bg-slate-700/80 text-slate-200 hover:border-teal-500/70 hover:bg-teal-950/50'
              } disabled:cursor-default`}
              aria-label={
                timerActive
                  ? `טיימר סט ${index + 1} — ${setTimerRemaining} שניות נותרו`
                  : `הפעל טיימר ${perSetHoldSeconds} שניות לסט ${index + 1}`
              }
            >
              {timerActive ? (
                <span className="text-xs font-bold tabular-nums">{setTimerRemaining}</span>
              ) : (
                <Play className="w-3.5 h-3.5" fill="currentColor" aria-hidden />
              )}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(15, 23, 42, 0.78)' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ex-training-title"
      onPointerDownCapture={primeTimerEndAudioFromUserGesture}
    >
      <div
        className="w-full max-w-[min(96vw,920px)] max-h-[min(96vh,880px)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden min-h-0"
        data-training-variant={variant}
        onPointerDownCapture={primeTimerEndAudioFromUserGesture}
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

        <div
          className="flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
          data-scroll-lock-allow
        >
          <div className="shrink-0 border-b border-slate-700/70 bg-[#0f172a] px-3 sm:px-4 pt-3 pb-3">
            <div className="relative w-full max-h-[min(38vh,320px)] sm:max-h-[min(42vh,360px)] md:max-h-[min(48vh,420px)] mx-auto">
              {presentation.kind === 'iframe' && hasVideoUrl ? (
                <div className="w-full aspect-video rounded-xl shadow-md overflow-hidden bg-slate-800">
                  <iframe
                    title={title}
                    className="w-full h-full border-0"
                    src={iframeSrc}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              ) : presentation.kind === 'mp4' && hasVideoUrl && !videoLoadError ? (
                <video
                  ref={videoRef}
                  key={trimmedVideoUrl}
                  className="w-full rounded-xl shadow-md mt-0 aspect-video bg-gray-100 object-contain"
                  src={trimmedVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  loop
                  onError={() => setFailedVideoUrl(trimmedVideoUrl)}
                />
              ) : videoLoadError && hasVideoUrl ? (
                <div className="w-full aspect-video rounded-xl shadow-md bg-slate-800 flex items-center justify-center px-4 text-center">
                  <p className="text-slate-300 text-sm">לא ניתן לטעון את הסרטון</p>
                </div>
              ) : (
                <div className="w-full aspect-video rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 text-sm px-4 text-center">
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
                  {lateralizationRequired ? ' · לכל צד' : ''}
                </p>
              </div>

              {lateralizationRequired ? (
                <>
                  <p className="text-[11px] text-slate-400">
                    בצעו את כל הסטים בכל צד. סמנו V לכל סט שהושלם (
                    {completedSetCount}/{totalSetSlots})
                  </p>
                  <div
                    className="flex rounded-lg border border-slate-600 overflow-hidden"
                    role="tablist"
                    aria-label="בחירת צד לתרגול"
                  >
                    {(['right', 'left'] as const).map((side) => {
                      const sideComplete =
                        (side === 'right' ? checkedSetsRight : checkedSetsLeft).every(Boolean);
                      const sideDone =
                        side === 'right' ? completedRightCount : completedLeftCount;
                      return (
                        <button
                          key={side}
                          type="button"
                          role="tab"
                          aria-selected={activeSide === side}
                          onClick={() => setActiveSide(side)}
                          className={`flex-1 px-2 py-2 text-xs sm:text-sm font-bold transition-colors touch-manipulation ${
                            activeSide === side
                              ? 'bg-teal-700/80 text-white'
                              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                          }`}
                        >
                          <span>{sideLabels[side]}</span>
                          <span
                            className={`block text-[10px] font-semibold mt-0.5 tabular-nums ${
                              sideComplete ? 'text-emerald-300' : 'text-slate-400'
                            }`}
                          >
                            {sideDone}/{safeTargetSets}
                            {sideComplete ? ' ✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <ul className="space-y-2" aria-label={`רשימת סטים — ${sideLabels[activeSide]}`}>
                    {checkedSetsForActiveSide.map((checked, index) =>
                      renderSetRow(activeSide, index, checked)
                    )}
                  </ul>
                  {!allSetsChecked && (
                    <p className="text-[10px] text-amber-300/90 leading-snug">
                      {completedRightCount < safeTargetSets && completedLeftCount < safeTargetSets
                        ? `השלימו ${safeTargetSets} סטים ב${sideLabels.right} וב${sideLabels.left}.`
                        : completedRightCount < safeTargetSets
                          ? `נותרו ${safeTargetSets - completedRightCount} סטים ב${sideLabels.right}.`
                          : `נותרו ${safeTargetSets - completedLeftCount} סטים ב${sideLabels.left}.`}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-400">
                    סמנו V לכל סט שהושלם ({completedSetCount}/{safeTargetSets})
                  </p>
                  <ul className="space-y-2" aria-label="רשימת סטים">
                    {checkedSetsRight.map((checked, index) =>
                      renderSetRow('right', index, checked)
                    )}
                  </ul>
                </>
              )}
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
