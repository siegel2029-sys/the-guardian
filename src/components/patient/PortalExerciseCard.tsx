import { useRef } from 'react';
import {
  Play,
  CheckCircle2,
  Zap,
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
  subtitle: string;
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
}

export default function PortalExerciseCard({
  variant,
  index,
  isCompleted,
  title,
  subtitle,
  xpReward,
  videoUrl,
  onOpenTraining,
  rewardLabelXp,
  rewardLabelCoins,
  disabled = false,
  typeKey,
  isCustomExercise,
  onOpenDetails,
  levelLine,
  canAdvance,
  onAdvance,
  selfCareStrengthTier,
  onSelfCareStrengthTierChange,
}: PortalExerciseCardProps) {
  const hasVideo = Boolean(videoUrl);
  const thumbVideoRef = useRef<HTMLVideoElement>(null);
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

  return (
    <article
      className={`rounded-2xl border border-slate-200/80 bg-white w-full shadow-md shadow-slate-200/45 outline-none transition-shadow ${
        disabled ? 'opacity-40 pointer-events-none' : 'hover:shadow-lg hover:shadow-slate-200/50'
      } ${!isCompleted && !disabled ? 'focus-within:ring-2 focus-within:ring-medical-primary/30 focus-within:ring-offset-2' : ''}`}
      dir="rtl"
      aria-label={isCompleted ? `${title} — הושלם` : `משימה ${index}: ${title}`}
    >
      {/* סרגל התקדמות למשימה בודדת */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-base font-semibold text-slate-600 tabular-nums">משימה {index}</span>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-base font-bold text-medical-success">
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden />
              הושלם
            </span>
          ) : (
            <span className="text-base font-medium text-slate-500">ממתין</span>
          )}
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={isCompleted ? 100 : 0} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: isCompleted ? '100%' : '12%',
              background: isCompleted ? '#10b981' : '#cbd5e1',
            }}
          />
        </div>
      </div>

      <div className="flex gap-3 p-4 pt-3 items-start">
        <div
          className="shrink-0 rounded-xl overflow-hidden border border-slate-200 relative bg-slate-50"
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
            style={{ background: 'rgba(15,23,42,0.12)' }}
            aria-hidden
          >
            <Play className="w-5 h-5 text-white drop-shadow-md" style={{ marginInlineStart: '2px' }} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h3
              className={`text-lg font-bold leading-snug min-w-0 flex-1 ${isCompleted ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}
            >
              {title}
            </h3>
            {variant === 'rehab' && isCustomExercise && (
              <Sparkles className="w-4 h-4 shrink-0 text-orange-500" aria-label="מותאם" />
            )}
            {variant === 'rehab' && !isCustomExercise && type && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0 leading-none"
                style={{ background: type.bg, color: type.text }}
              >
                {type.label}
              </span>
            )}
            {variant === 'selfCare' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0 leading-none bg-blue-50 text-blue-800">
                כוח
              </span>
            )}
          </div>
          <p className="text-base text-slate-600 mt-1.5 leading-relaxed">{subtitle}</p>
          {variant === 'selfCare' && levelLine && (
            <p className="text-sm text-slate-700 font-semibold mt-1">{levelLine}</p>
          )}
          {(rewardLabelXp != null || rewardLabelCoins != null) && (
            <div className="mt-2">
              <RewardLabel xp={rewardLabelXp} coins={rewardLabelCoins} />
            </div>
          )}
          <div
            className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg text-sm font-bold text-amber-900 bg-amber-50 border border-amber-200/80"
          >
            <Zap className="w-4 h-4 shrink-0 text-amber-600" aria-hidden />
            {xpReward} XP
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        <button
          type="button"
          disabled={disabled || isCompleted}
          onClick={onOpenTraining}
          className="w-full min-h-14 flex items-center justify-center gap-2.5 rounded-2xl py-4 px-4 text-lg font-bold text-white shadow-md transition-opacity disabled:opacity-45 disabled:cursor-not-allowed active:opacity-95 active:scale-[0.99] motion-safe:transition-transform bg-medical-primary"
          style={{ boxShadow: '0 6px 20px rgba(37, 99, 235, 0.32)' }}
        >
          <Play className="w-6 h-6 shrink-0" fill="currentColor" aria-hidden />
          {isCompleted ? 'הושלם להיום' : 'התחל אימון'}
        </button>

        {variant === 'selfCare' &&
          onSelfCareStrengthTierChange != null &&
          selfCareStrengthTier !== undefined && (
            <div className="flex flex-col gap-2 w-full min-w-0 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-700">רמת קושי</span>
                <span
                  className="text-sm font-black px-2.5 py-1 rounded-lg shrink-0 border border-slate-200 bg-slate-50 text-slate-800"
                >
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
                  className="shrink-0 min-h-12 min-w-12 rounded-xl flex items-center justify-center border-2 border-slate-200 bg-white text-slate-800 disabled:opacity-35 disabled:cursor-not-allowed hover:border-medical-primary/40 transition-colors"
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
                  className="shrink-0 min-h-12 min-w-12 rounded-xl flex items-center justify-center border-2 border-slate-200 bg-white text-slate-800 disabled:opacity-35 disabled:cursor-not-allowed hover:border-medical-primary/40 transition-colors"
                  aria-label="החמרת רמת קושי"
                >
                  <Plus className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

        {variant === 'rehab' && onOpenDetails && !disabled && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="text-sm font-semibold text-medical-primary hover:text-blue-800 underline-offset-2 hover:underline ps-0.5"
          >
            הוראות מלאות
          </button>
        )}

        {variant === 'selfCare' && onAdvance != null && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canAdvance || disabled}
              onClick={onAdvance}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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

        <p className="text-base text-slate-500 leading-snug ps-0.5">
          {hoverPlayEnabled
            ? 'מעבר עכבר על התמונה מנגן תצוגה מקדימה (מושתק). הכפתור הכחול פותח את מסך האימון המלא.'
            : 'וידאו, טיימר ודיווח מאמץ — במסך האימון דרך כפתור «התחל אימון». '}
        </p>
      </div>
    </article>
  );
}
