import { useRef, useEffect, useState } from 'react';
import {
  Play,
  CheckCircle2,
  Sparkles,
  PersonStanding,
  TrendingUp,
  Minus,
  Plus,
} from 'lucide-react';
import { RewardLabel } from '../ui/RewardLabel';

const THUMB_W = 80;
const THUMB_H = 56;

const typeStyle: Record<string, { bg: string; text: string; label: string }> = {
  clinical: { bg: '#dbeafe', text: '#1d4ed8', label: 'קליני' },
  standard: { bg: '#f3e8ff', text: '#6b21a8', label: 'סטנדרטי' },
  custom: { bg: '#fff7ed', text: '#c2410c', label: 'מותאם' },
};

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
  /** מוצג בשורת כרטיס — סטים, חזרות, משקל/התנגדות */
  setsLabel: string;
  repsLabel: string;
  weightLabel: string;
  /** @deprecated הוראות מלאות רק במסך האימון עם הטיימר */
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
  /** שיקום: סימון הושלמה (דיווח) — רק אחרי שהופעל טיימר באימון */
  onMarkComplete?: () => void;
  /** שיקום: מותר לסמן הושלמה (אחרי «התחל תרגול» במודאל) */
  markCompleteAllowed?: boolean;
  /** שיקום: חובה (קליני) מול נוסף לבחירה — עיצוב ותגמול */
  rehabTier?: 'core' | 'optional';
}

export default function PortalExerciseCard({
  variant,
  index,
  isCompleted,
  title,
  setsLabel,
  repsLabel,
  weightLabel,
  notesLine: _notesLine,
  xpReward: _xpReward,
  videoUrl,
  onOpenTraining,
  rewardLabelXp,
  rewardLabelCoins,
  disabled = false,
  typeKey,
  isCustomExercise,
  onOpenDetails: _onOpenDetails,
  levelLine,
  canAdvance,
  onAdvance,
  selfCareStrengthTier,
  onSelfCareStrengthTierChange,
  onMarkComplete,
  markCompleteAllowed = false,
  rehabTier = 'core',
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

  const type =
    variant === 'rehab' && !isCustomExercise && typeKey
      ? typeStyle[typeKey] ?? typeStyle.standard
      : null;

  const tierLabels: Record<0 | 1 | 2, string> = { 0: 'קל', 1: 'בינוני', 2: 'קשה' };

  const showCompleteCta =
    variant === 'rehab' &&
    onMarkComplete &&
    markCompleteAllowed &&
    !isCompleted &&
    !disabled;

  const rehabShell =
    variant === 'rehab' && rehabTier === 'optional'
      ? 'border-slate-200/80 bg-gradient-to-br from-slate-50/95 to-white'
      : variant === 'rehab' && rehabTier === 'core'
        ? 'border-sky-200/90 bg-gradient-to-br from-sky-50/50 to-white'
        : '';

  return (
    <article
      className={`rounded-xl border w-full shadow-sm outline-none transition-shadow motion-safe:transition-transform ${
        rehabShell ||
        'border-slate-200/90 bg-white'
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
      <div className="flex gap-3 p-4 items-start border-b border-slate-100/90">
        <div
          className="shrink-0 rounded-lg overflow-hidden border border-slate-200 relative bg-slate-50"
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
              <PersonStanding className="w-7 h-7 text-slate-400" strokeWidth={1.75} />
            </div>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(15,23,42,0.1)' }}
            aria-hidden
          >
            <Play className="w-5 h-5 text-white drop-shadow-md" style={{ marginInlineStart: '2px' }} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
            <h3
              className={`text-base font-bold leading-snug min-w-0 flex-1 ${
                isCompleted ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'
              }`}
            >
              {title}
            </h3>
            {isCompleted ? (
              <span
                className={`inline-flex items-center gap-1 text-sm font-bold text-medical-success shrink-0 ${
                  completionBurst ? 'motion-safe:animate-checkmark-pop' : ''
                }`}
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden />
                הושלם
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide shrink-0">
                ממתין
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {variant === 'rehab' && isCustomExercise && (
              <Sparkles className="w-4 h-4 shrink-0 text-orange-500" aria-label="מותאם" />
            )}
            {variant === 'rehab' && !isCustomExercise && type && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 leading-none"
                style={{ background: type.bg, color: type.text }}
              >
                {type.label}
              </span>
            )}
            {variant === 'selfCare' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 leading-none bg-blue-50 text-blue-800">
                כוח
              </span>
            )}
            {variant === 'rehab' && rehabTier === 'optional' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 leading-none bg-slate-100 text-slate-600 border border-slate-200/80">
                לבחירה · בונוס
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center border-b border-slate-100/90 bg-slate-50/50">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">סטים</p>
          <p className="text-sm font-bold text-slate-800 tabular-nums">{setsLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">חזרות</p>
          <p className="text-sm font-bold text-slate-800 tabular-nums">{repsLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
            {variant === 'selfCare' ? 'עומס' : 'משקל'}
          </p>
          <p className="text-sm font-bold text-slate-800 tabular-nums">{weightLabel}</p>
        </div>
      </div>

      {variant === 'selfCare' && levelLine && (
        <div className="px-4 py-2 border-b border-slate-100/90">
          <p className="text-sm text-slate-700 font-semibold">{levelLine}</p>
        </div>
      )}

      <div className="p-4 space-y-3">
        {(rewardLabelXp != null || rewardLabelCoins != null) && (
          <div className="text-center sm:text-start">
            <RewardLabel
              xp={rewardLabelXp ?? 0}
              coins={rewardLabelCoins ?? 0}
            />
          </div>
        )}

        {showCompleteCta && (
          <button
            type="button"
            onClick={onMarkComplete}
            className="w-full min-h-[3.5rem] flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-base font-bold text-white bg-medical-success shadow-sm border border-emerald-600/20 active:scale-[0.99] motion-safe:transition-transform touch-manipulation"
            style={{ boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)' }}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden />
            סימון הושלמה
          </button>
        )}

        <button
          type="button"
          disabled={disabled || isCompleted}
          onClick={onOpenTraining}
          className="w-full min-h-[3.75rem] flex items-center justify-center gap-2.5 rounded-xl py-4 px-4 text-lg font-bold text-white shadow-md disabled:opacity-45 disabled:cursor-not-allowed active:opacity-95 active:scale-[0.99] motion-safe:transition-transform touch-manipulation bg-medical-primary"
          style={{ boxShadow: '0 6px 20px rgba(37, 99, 235, 0.28)' }}
        >
          <Play className="w-6 h-6 shrink-0" fill="currentColor" aria-hidden />
          {isCompleted ? 'הושלם להיום' : 'התחלת אימון'}
        </button>

        {variant === 'selfCare' &&
          onSelfCareStrengthTierChange != null &&
          selfCareStrengthTier !== undefined && (
            <div className="flex flex-col gap-2 w-full min-w-0 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-700">רמת קושי</span>
                <span className="text-sm font-black px-2.5 py-1 rounded-lg shrink-0 border border-slate-200 bg-slate-50 text-slate-800">
                  {tierLabels[selfCareStrengthTier]}
                </span>
              </div>
              <div className="flex items-center gap-2 w-full min-w-0">
                <button
                  type="button"
                  disabled={disabled || selfCareStrengthTier <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelfCareStrengthTierChange(
                      (Math.max(0, selfCareStrengthTier - 1) as 0 | 1 | 2)
                    );
                  }}
                  className="shrink-0 min-h-12 min-w-12 rounded-xl flex items-center justify-center border-2 border-slate-200 bg-white text-slate-800 disabled:opacity-35 disabled:cursor-not-allowed hover:border-medical-primary/40 transition-colors touch-manipulation"
                  aria-label="הקלה ברמת קושי"
                >
                  <Minus className="w-5 h-5" strokeWidth={2.5} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={selfCareStrengthTier}
                  disabled={disabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSelfCareStrengthTierChange(Number(e.target.value) as 0 | 1 | 2);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 h-3 rounded-lg appearance-none cursor-pointer accent-[#2563eb]"
                  style={{ background: '#e2e8f0' }}
                  aria-valuetext={tierLabels[selfCareStrengthTier]}
                />
                <button
                  type="button"
                  disabled={disabled || selfCareStrengthTier >= 2}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelfCareStrengthTierChange(
                      (Math.min(2, selfCareStrengthTier + 1) as 0 | 1 | 2)
                    );
                  }}
                  className="shrink-0 min-h-12 min-w-12 rounded-xl flex items-center justify-center border-2 border-slate-200 bg-white text-slate-800 disabled:opacity-35 disabled:cursor-not-allowed hover:border-medical-primary/40 transition-colors touch-manipulation"
                  aria-label="החמרת רמת קושי"
                >
                  <Plus className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

        {variant === 'selfCare' && onAdvance != null && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canAdvance || disabled}
              onClick={onAdvance}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-12"
              style={{
                borderColor: canAdvance ? '#10b981' : '#e2e8f0',
                background: canAdvance ? '#ecfdf5' : '#f8fafc',
                color: '#065f46',
              }}
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              {canAdvance ? 'העלאת קושי / משקל' : 'ברמה המקסימלית'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
