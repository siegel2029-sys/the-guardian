import { useRef } from 'react';
import {
  Play,
  CheckCircle2,
  Zap,
  Sparkles,
  PersonStanding,
  TrendingUp,
} from 'lucide-react';

const THUMB_W = 64;
const THUMB_H = 40;

const typeStyle: Record<string, { bg: string; text: string; label: string }> = {
  clinical: { bg: '#e0f2fe', text: '#0369a1', label: 'קליני' },
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
  /** פותח את ממשק האימון המלא (וידאו, טיימר, מאמץ — הכל במודאל) */
  onOpenTraining: () => void;
  disabled?: boolean;
  /** rehab */
  typeKey?: string;
  isCustomExercise?: boolean;
  onOpenDetails?: () => void;
  /** self-care */
  levelLine?: string;
  canAdvance?: boolean;
  onAdvance?: () => void;
  /** בורר קל/בינוני/קשה — מתאים לשלבי L1–L3 במסד */
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

  const borderColor = isCompleted
    ? '#86efac'
    : isCustomExercise
      ? '#fed7aa'
      : '#d1fae5';

  const bgMain = isCustomExercise ? '#fffdf8' : '#ffffff';

  const cardShadow = '0 1px 2px rgba(13, 148, 136, 0.06)';

  const tierLabels: Record<0 | 1 | 2, string> = { 0: 'קל', 1: 'בינוני', 2: 'קשה' };

  return (
    <div
      className={`rounded-xl border w-full outline-none transition-colors ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${isCompleted ? '' : 'focus-within:ring-2 focus-within:ring-teal-400 focus-within:ring-offset-1'}`}
      style={{
        background: bgMain,
        borderColor,
        borderWidth: 1,
        boxShadow: cardShadow,
        opacity: isCompleted ? 0.88 : 1,
        minHeight: THUMB_H + 16,
      }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 py-2 pr-2 pl-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenTraining}
          onMouseEnter={handleThumbEnter}
          onMouseLeave={handleThumbLeave}
          className="shrink-0 rounded-lg overflow-hidden border relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          style={{
            width: THUMB_W,
            height: THUMB_H,
            borderColor: '#99f6e4',
            background: '#ecfdf5',
          }}
          aria-label="פתח ממשק אימון"
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
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-100">
              <PersonStanding className="w-5 h-5 text-teal-600/70" strokeWidth={1.75} />
            </div>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.08)' }}
          >
            <Play className="w-3.5 h-3.5 text-white drop-shadow-sm" style={{ marginRight: '-1px' }} />
          </div>
        </button>

        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black shrink-0"
          style={
            isCompleted
              ? { background: '#d1fae5', color: '#059669' }
              : { background: '#e0f7f9', color: '#0d9488' }
          }
        >
          {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : index}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4
              className="text-xs font-semibold leading-tight truncate"
              style={{ color: isCompleted ? '#475569' : '#0f172a' }}
            >
              {title}
            </h4>
            {isCompleted ? (
              <span
                className="text-[8px] font-bold px-1 py-0 rounded shrink-0 leading-none whitespace-nowrap"
                style={{ background: '#d1fae5', color: '#047857' }}
              >
                הושלם היום
              </span>
            ) : null}
            {variant === 'rehab' && isCustomExercise && (
              <Sparkles className="w-3 h-3 shrink-0 text-orange-500" aria-label="מותאם" />
            )}
            {variant === 'rehab' && !isCustomExercise && type && (
              <span
                className="text-[8px] font-bold px-1 py-0 rounded shrink-0 leading-none"
                style={{ background: type.bg, color: type.text }}
              >
                {type.label.length > 2 ? type.label.slice(0, 2) : type.label}
              </span>
            )}
            {variant === 'selfCare' && (
              <span
                className="text-[8px] font-bold px-1 py-0 rounded shrink-0 leading-none"
                style={{ background: '#e0f2fe', color: '#0369a1' }}
              >
                כוח
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate mt-0.5 leading-tight">{subtitle}</p>
          {variant === 'selfCare' && levelLine && (
            <p className="text-[9px] text-teal-800/90 font-semibold mt-0.5">{levelLine}</p>
          )}
        </div>

        <div
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0"
          style={{ background: '#fef9c3', color: '#a16207' }}
        >
          <Zap className="w-2.5 h-2.5" />
          {xpReward}
        </div>
      </div>

      <div className="px-2.5 pb-2.5 space-y-2">
        {variant === 'selfCare' &&
          onSelfCareStrengthTierChange != null &&
          selfCareStrengthTier !== undefined && (
            <div className="flex flex-wrap items-center gap-1.5 pr-0.5">
              <span className="text-[9px] font-bold text-slate-600 shrink-0">רמת קושי:</span>
              {([0, 1, 2] as const).map((t) => {
                const active = selfCareStrengthTier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelfCareStrengthTierChange(t);
                    }}
                    className="px-2 py-1 rounded-lg text-[9px] font-black transition-all border disabled:opacity-40"
                    style={{
                      borderColor: active ? '#0d9488' : '#cbd5e1',
                      background: active ? 'linear-gradient(135deg,#ecfdf5,#d1fae5)' : '#f8fafc',
                      color: active ? '#065f46' : '#64748b',
                      boxShadow: active ? '0 1px 6px rgba(13,148,136,0.2)' : 'none',
                    }}
                  >
                    {tierLabels[t]}
                  </button>
                );
              })}
            </div>
          )}

        {variant === 'rehab' && onOpenDetails && !disabled && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="text-[10px] font-semibold text-teal-600 hover:text-teal-800 underline-offset-2 hover:underline pr-1"
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
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              style={{
                borderColor: '#34d399',
                background: canAdvance ? '#ecfdf5' : '#f8fafc',
                color: '#065f46',
                boxShadow: canAdvance ? '0 2px 8px rgba(16, 185, 129, 0.12)' : 'none',
              }}
            >
              <TrendingUp className="w-3 h-3 shrink-0" />
              {canAdvance ? 'העלאת קושי / משקל' : 'ברמה המקסימלית'}
            </button>
          </div>
        )}

        <p className="text-[10px] text-slate-500 pr-1 leading-snug">
          {hoverPlayEnabled
            ? 'מעבר עכבר על התמונה מנגן תצוגה מקדימה (מושתק). לחיצה פותחת את מסך האימון.'
            : 'וידאו, טיימר 30 שניות ומאמץ — בתוך מסך האימון בלחיצה על התמונה.'}
        </p>
      </div>
    </div>
  );
}
