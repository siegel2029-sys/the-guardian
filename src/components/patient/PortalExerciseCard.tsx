import { useRef, useEffect, useState } from 'react';
import {
  Play,
  CheckCircle2,
  Sparkles,
  PersonStanding,
  TrendingUp,
  Minus,
  Plus,
  Zap,
  Coins,
} from 'lucide-react';

const THUMB_W = 68;
const THUMB_H = 46;

/** מסיר שורת מפתח "הערות:" משדה הוראות — התוכן נשאר */
export function stripPortalTherapistNotesPrefix(s: string): string {
  return s.replace(/^\s*הערות\s*:\s*/u, '').trim();
}

function isLikelyDirectVideoUrl(url: string | null): boolean {
  const u = (url ?? '').trim().toLowerCase();
  if (!u) return false;
  if (u.includes('youtu.be') || u.includes('youtube.com') || u.includes('vimeo.com')) return false;
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(u) || u.startsWith('blob:');
}

export type PortalExerciseCardVariant = 'rehab' | 'selfCare';

export interface PortalExerciseCardProps {
  variant: PortalExerciseCardVariant;
  index: number;
  isCompleted: boolean;
  title: string;
  /** @deprecated Prefer setsLabel, repsLabel, weightLabel */
  subtitle?: string;
  setsLabel: string;
  repsLabel: string;
  weightLabel: string;
  /** הערות מטפל — תצוגה קומפקטית בכרטיס */
  notesLine?: string | null;
  xpReward: number;
  videoUrl: string | null;
  onOpenTraining: () => void;
  rewardLabelXp?: number;
  rewardLabelCoins?: number;
  disabled?: boolean;
  typeKey?: string;
  isCustomExercise?: boolean;
  onOpenDetails?: () => void;
  levelLine?: string;
  canAdvance?: boolean;
  onAdvance?: () => void;
  selfCareStrengthTier?: 0 | 1 | 2;
  onSelfCareStrengthTierChange?: (tier: 0 | 1 | 2) => void;
  onMarkComplete?: () => void;
  markCompleteAllowed?: boolean;
  rehabTier?: 'core' | 'optional';
  /** תרגילי שיקום לבחירה — סרגל קושי בכרטיס (לא בחובה) */
  optionalRehabDifficultyTier?: 0 | 1 | 2;
  onOptionalRehabDifficultyTierChange?: (tier: 0 | 1 | 2) => void;
  /** כרטיס כוח — הסתרת שורת אזור/כוח או כפתורי התקדמות (לא סרגל קושי) */
  hideStrengthPreviewControls?: boolean;
}

export default function PortalExerciseCard({
  variant,
  index,
  isCompleted,
  title,
  setsLabel,
  repsLabel,
  weightLabel,
  notesLine,
  xpReward: _xpReward,
  videoUrl,
  onOpenTraining,
  rewardLabelXp,
  rewardLabelCoins,
  disabled = false,
  isCustomExercise,
  levelLine,
  canAdvance,
  onAdvance,
  selfCareStrengthTier,
  onSelfCareStrengthTierChange,
  onMarkComplete,
  markCompleteAllowed = false,
  rehabTier = 'core',
  optionalRehabDifficultyTier,
  onOptionalRehabDifficultyTierChange,
  hideStrengthPreviewControls = false,
}: PortalExerciseCardProps) {
  const hasVideo = Boolean(videoUrl);
  const thumbVideoRef = useRef<HTMLVideoElement>(null);
  const prevCompletedRef = useRef(isCompleted);
  const [completionBurst, setCompletionBurst] = useState(false);

  useEffect(() => {
    if (isCompleted && !prevCompletedRef.current) {
      setCompletionBurst(true);
      const t = window.setTimeout(() => setCompletionBurst(false), 600);
      prevCompletedRef.current = isCompleted;
      return () => clearTimeout(t);
    }
    prevCompletedRef.current = isCompleted;
  }, [isCompleted]);
  const hoverPlayEnabled = hasVideo && isLikelyDirectVideoUrl(videoUrl);

  const handleThumbEnter = () => {
    const el = thumbVideoRef.current;
    if (!el || !hoverPlayEnabled) return;
    el.muted = true;
    el.play().catch(() => {});
  };

  const handleThumbLeave = () => {
    const el = thumbVideoRef.current;
    if (!el) return;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  };

  const tierLabels: Record<0 | 1 | 2, string> = { 0: 'קל', 1: 'בינוני', 2: 'קשה' };

  const showCompleteCta =
    variant === 'rehab' &&
    onMarkComplete &&
    markCompleteAllowed &&
    !isCompleted &&
    !disabled;

  const showRewards = rewardLabelXp != null || rewardLabelCoins != null;
  const xpDisplay = rewardLabelXp ?? 0;
  const coinsDisplay = rewardLabelCoins ?? 0;

  const rehabShell =
    variant === 'rehab' && rehabTier === 'optional'
      ? 'border-slate-200/80 bg-gradient-to-br from-slate-50/95 to-white'
      : variant === 'rehab' && rehabTier === 'core'
        ? 'border-sky-200/90 bg-gradient-to-br from-sky-50/50 to-white'
        : '';

  const notesTrimmed = stripPortalTherapistNotesPrefix((notesLine ?? '').trim());

  const optionalRehabSlider =
    variant === 'rehab' &&
    rehabTier === 'optional' &&
    onOptionalRehabDifficultyTierChange != null &&
    optionalRehabDifficultyTier !== undefined;

  const selfCareDifficultySlider =
    variant === 'selfCare' &&
    !hideStrengthPreviewControls &&
    onSelfCareStrengthTierChange != null &&
    selfCareStrengthTier !== undefined;

  const showDifficultySlider = optionalRehabSlider || selfCareDifficultySlider;
  const difficultyTier = optionalRehabSlider
    ? optionalRehabDifficultyTier
    : selfCareDifficultySlider
      ? selfCareStrengthTier
      : undefined;
  const setDifficultyTier = optionalRehabSlider
    ? onOptionalRehabDifficultyTierChange
    : selfCareDifficultySlider
      ? onSelfCareStrengthTierChange
      : undefined;

  return (
    <article
      className={`rounded-lg border w-full shadow-sm outline-none transition-shadow motion-safe:transition-transform ${
        rehabShell || 'border-slate-200/90 bg-white'
      } ${
        disabled ? 'opacity-40 pointer-events-none' : 'hover:shadow-md'
      } ${completionBurst ? 'motion-safe:animate-exercise-complete-pop' : ''} ${
        !isCompleted && !disabled
          ? 'focus-within:ring-2 focus-within:ring-medical-primary/25 focus-within:ring-offset-1'
          : ''
      }`}
      dir="rtl"
      aria-label={isCompleted ? `${title} — הושלם` : `משימה ${index}: ${title}`}
    >
      {/* מלבן קומפקטי: תמונה + תוכן — הוראות מטפל רק במסך האימון */}
      <div
        className={`flex items-start border-b border-slate-100/90 ${
          variant === 'rehab'
            ? 'gap-1.5 p-1.5 sm:p-2'
            : 'gap-2 p-2 sm:p-2.5'
        }`}
      >
        <div
          className="shrink-0 rounded-md overflow-hidden border border-slate-200/90 relative bg-slate-50"
          style={{ width: THUMB_W, height: THUMB_H }}
          onMouseEnter={handleThumbEnter}
          onMouseLeave={handleThumbLeave}
        >
          {hasVideo ? (
            <video
              ref={hoverPlayEnabled ? thumbVideoRef : undefined}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              src={videoUrl ?? undefined}
              muted
              playsInline
              loop
              preload="metadata"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
              <PersonStanding className="w-6 h-6 text-slate-400" strokeWidth={1.75} />
            </div>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(15,23,42,0.1)' }}
            aria-hidden
          >
            <Play className="w-4 h-4 text-white drop-shadow-md" style={{ marginInlineStart: '2px' }} />
          </div>
        </div>

        <div
          className={`flex-1 min-w-0 flex flex-col ${variant === 'rehab' ? 'gap-0.5' : 'gap-1'}`}
        >
          <div className="flex items-start justify-between gap-2 min-w-0">
            <h3
              className={`text-sm font-bold leading-snug min-w-0 flex-1 ${
                isCompleted ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'
              }`}
            >
              {title}
            </h3>
            {isCompleted && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-bold text-medical-success shrink-0 ${
                  completionBurst ? 'motion-safe:animate-checkmark-pop' : ''
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                הושלם
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {variant === 'rehab' && isCustomExercise && (
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-orange-500" aria-label="מותאם" />
            )}
            {variant === 'selfCare' && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 leading-none bg-blue-50 text-blue-800">
                כוח
              </span>
            )}
          </div>

          <div
            className={`grid grid-cols-3 gap-1 text-center rounded-md border border-slate-100/90 bg-slate-50/70 px-1 ${
              variant === 'rehab' ? 'py-0.5' : 'py-1'
            }`}
          >
            <div>
              <p className="text-[9px] font-bold text-slate-400 mb-0.5">סטים</p>
              <p className="text-xs font-bold text-slate-800 tabular-nums leading-none">{setsLabel}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 mb-0.5">חזרות</p>
              <p className="text-xs font-bold text-slate-800 tabular-nums leading-none">{repsLabel}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 mb-0.5">
                {variant === 'selfCare' ? 'עומס' : 'משקל'}
              </p>
              <p className="text-xs font-bold text-slate-800 tabular-nums leading-none">{weightLabel}</p>
            </div>
          </div>

          {variant !== 'rehab' && notesTrimmed.length > 0 && (
            <p
              className="text-[11px] text-slate-600 leading-tight line-clamp-2"
              title={notesTrimmed}
            >
              {notesTrimmed}
            </p>
          )}
        </div>
      </div>

      {variant === 'selfCare' && levelLine && !hideStrengthPreviewControls && (
        <div className="px-2.5 py-1 border-b border-slate-100/90">
          <p className="text-[11px] text-slate-700 font-semibold leading-snug">{levelLine}</p>
        </div>
      )}

      <div
        className={`relative w-full flex flex-col ${
          variant === 'rehab'
            ? 'gap-1 items-stretch px-1.5 sm:px-2 pt-1'
            : 'gap-1.5 px-2 sm:px-2.5 pt-1.5'
        } ${showRewards ? (showDifficultySlider ? 'pb-11' : 'pb-9') : ''}`}
      >
        {showCompleteCta && (
          <button
            type="button"
            onClick={onMarkComplete}
            className="w-full min-h-[2.75rem] flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-sm font-bold text-center text-white bg-medical-success border border-emerald-600/20 active:scale-[0.99] motion-safe:transition-transform touch-manipulation"
            style={{ boxShadow: '0 2px 10px rgba(16, 185, 129, 0.22)' }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
            סימון הושלמה
          </button>
        )}

        {showDifficultySlider &&
          difficultyTier !== undefined &&
          setDifficultyTier != null && (
            <div className="w-full min-w-0 border-t border-slate-100/90 pt-1.5 pb-0.5">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">רמת קושי</p>
              <div className="flex items-center gap-1 w-full min-w-0">
                <button
                  type="button"
                  disabled={disabled || difficultyTier <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDifficultyTier((Math.max(0, difficultyTier - 1) as 0 | 1 | 2));
                  }}
                  className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center border border-slate-200/90 bg-white text-slate-700 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] touch-manipulation"
                  aria-label="הקלה ברמת קושי"
                >
                  <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={difficultyTier}
                  disabled={disabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    setDifficultyTier(Number(e.target.value) as 0 | 1 | 2);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 h-1.5 rounded-full appearance-none cursor-pointer accent-medical-primary"
                  style={{ background: '#e2e8f0' }}
                  aria-valuetext={tierLabels[difficultyTier]}
                />
                <button
                  type="button"
                  disabled={disabled || difficultyTier >= 2}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDifficultyTier((Math.min(2, difficultyTier + 1) as 0 | 1 | 2));
                  }}
                  className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center border border-slate-200/90 bg-white text-slate-700 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] touch-manipulation"
                  aria-label="החמרת רמת קושי"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

        <button
          type="button"
          disabled={disabled || isCompleted}
          onClick={onOpenTraining}
          className="w-full min-h-[2.65rem] flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-sm font-bold text-center text-white shadow-md disabled:opacity-45 disabled:cursor-not-allowed active:opacity-95 active:scale-[0.99] motion-safe:transition-transform touch-manipulation bg-medical-primary"
          style={{ boxShadow: '0 4px 14px rgba(37, 99, 235, 0.22)' }}
        >
          <Play className="w-5 h-5 shrink-0" fill="currentColor" aria-hidden />
          {isCompleted ? 'הושלם להיום' : 'התחלת אימון'}
        </button>

        {showRewards && (
          <div
            className="absolute bottom-0 right-0 flex flex-col items-end gap-0.5 shrink-0 text-end pointer-events-none"
            aria-label="פרסים"
          >
            <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-slate-800 tabular-nums">
              <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>XP {xpDisplay}</span>
            </div>
            <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-slate-700 tabular-nums">
              <Coins className="w-3.5 h-3.5 shrink-0 text-amber-600" aria-hidden />
              <span>{coinsDisplay} מטבעות</span>
            </div>
          </div>
        )}

        {variant === 'selfCare' && !hideStrengthPreviewControls && onAdvance != null && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              disabled={!canAdvance || disabled}
              onClick={onAdvance}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-10"
              style={{
                borderColor: canAdvance ? '#10b981' : '#e2e8f0',
                background: canAdvance ? '#ecfdf5' : '#f8fafc',
                color: '#065f46',
              }}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              {canAdvance ? 'העלאת קושי / משקל' : 'ברמה המקסימלית'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
