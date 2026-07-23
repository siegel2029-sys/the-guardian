import { Zap, Coins, LogOut, Settings, Siren } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PatientRewardFeedback } from '../../hooks/useGamification';
import { PATIENT_REWARDS } from '../../config/patientRewards';
import { RewardLabel } from '../ui/RewardLabel';
import { activateOnEnterSpace } from './patientPortalRouting';

export interface PatientPortalChromeProps {
  portalPatientLabel: string;
  xp: number;
  xpForNextLevel: number;
  coins: number;
  level: number;
  displayStreak: number;
  patientMustChangePassword: boolean;
  portalFrozenUiLock: boolean;
  sessionRole: string | null | undefined;
  rewardFeedback: PatientRewardFeedback | null;
  coinKick: boolean;
  hasDailyLoginBonusPending: boolean;
  redFlagSirenAssetFailed: boolean;
  onRedFlagSirenAssetFailed: () => void;
  onOpenRedFlag: () => void;
  onOpenSettings: () => void;
  onGoToClinicalDashboardFromStreak: () => void;
  onLogout: () => void;
}

/** כותרת פורטל מטופל — XP / מטבעות / בונוס כניסה / Red Flag / הגדרות / יציאה */
export default function PatientPortalChrome({
  portalPatientLabel,
  xp,
  xpForNextLevel,
  coins,
  level,
  displayStreak,
  patientMustChangePassword,
  portalFrozenUiLock,
  sessionRole,
  rewardFeedback,
  coinKick,
  hasDailyLoginBonusPending,
  redFlagSirenAssetFailed,
  onRedFlagSirenAssetFailed,
  onOpenRedFlag,
  onOpenSettings,
  onGoToClinicalDashboardFromStreak,
  onLogout,
}: PatientPortalChromeProps) {
  const navigate = useNavigate();

  return (
    <header
      dir="ltr"
      className="relative grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 sm:gap-x-4 overflow-visible bg-white px-3 sm:px-4 py-3 border-b border-slate-200/80 shadow-md shadow-slate-200/40"
    >
      {/* טור 1 — שמאל: XP / מטבעות */}
      <div className="relative shrink-0 justify-self-start flex flex-col items-start justify-center gap-2">
        {rewardFeedback && (
          <div
            key={rewardFeedback.id}
            className="absolute top-full left-0 mt-1 flex flex-col items-start gap-0.5 pointer-events-none z-30"
          >
            {rewardFeedback.xpAdded > 0 && (
              <span className="text-xs font-black text-teal-600 tabular-nums drop-shadow-sm animate-portal-reward-float">
                +{rewardFeedback.xpAdded} XP
              </span>
            )}
            {rewardFeedback.streakBonusXp != null && rewardFeedback.streakBonusXp > 0 && (
              <span
                className="text-[10px] font-bold text-orange-600 tabular-nums animate-portal-reward-float"
                style={{ animationDelay: '0.08s' }}
              >
                רצף +{rewardFeedback.streakBonusXp} XP
              </span>
            )}
            {rewardFeedback.coinsAdded > 0 && (
              <span
                className="text-xs font-black text-amber-600 tabular-nums animate-portal-reward-float"
                style={{ animationDelay: '0.14s' }}
              >
                +{rewardFeedback.coinsAdded} מטבעות
              </span>
            )}
          </div>
        )}
        {!patientMustChangePassword && (
          <span
            title={`${xp.toLocaleString()} / ${xpForNextLevel.toLocaleString()} התקדמות לרמה הבאה`}
            className="inline-flex flex-col items-center gap-0.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-800 shadow-sm cursor-help min-w-[3rem]"
            role="img"
            aria-label={`${xp.toLocaleString()} מתוך ${xpForNextLevel.toLocaleString()} נקודות ניסיון — התקדמות לרמה הבאה`}
          >
            <Zap className="w-4 h-4 shrink-0 text-amber-500" strokeWidth={2.25} aria-hidden />
            <span className="tabular-nums leading-none">{xp.toLocaleString()}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => navigate('/shop')}
          title="מטבעות למידה — חנות"
          aria-label="מטבעות למידה — מעבר לחנות"
          disabled={portalFrozenUiLock}
          className={`inline-flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-sm font-bold text-slate-800 transition-transform duration-200 border-2 border-slate-200 bg-white hover:bg-amber-50/80 hover:border-amber-200/90 active:scale-[0.98] min-w-[3.25rem] disabled:opacity-40 disabled:pointer-events-none disabled:grayscale ${
            coinKick ? 'motion-safe:scale-110' : ''
          }`}
        >
          <Coins
            className={`w-5 h-5 text-amber-600 motion-safe:transition-transform ${coinKick ? 'motion-safe:scale-125' : ''}`}
          />
          <span className="tabular-nums leading-none">{coins}</span>
        </button>
      </div>

      {/* טור 2 — מרכז: רמה ושם בשורה; רצף מתחת לשם בלבד (ממורכז לעמודת השם) */}
      <div className="min-w-0 w-full max-w-full justify-self-stretch flex flex-col items-center justify-center gap-1 px-1 sm:px-2 text-center">
        {!patientMustChangePassword && (
          <>
            <div
              dir="ltr"
              className="flex w-full min-w-0 max-w-full flex-nowrap items-start justify-center gap-2"
            >
              <span className="shrink-0 pt-0.5 text-xs sm:text-sm font-bold tabular-nums text-emerald-600">
                רמה {level}
              </span>
              <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 text-center">
                <span
                  className="w-full min-w-0 text-lg sm:text-xl font-bold text-slate-900 leading-snug tracking-tight break-words text-center [overflow-wrap:anywhere]"
                  dir="rtl"
                >
                  {portalPatientLabel}
                </span>
                {hasDailyLoginBonusPending && (
                  <div className="flex justify-center items-center gap-1.5 flex-wrap" dir="rtl">
                    <RewardLabel
                      xp={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.xp}
                      coins={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.coins}
                    />
                    <span className="text-xs text-slate-500">כניסה יומית</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={portalFrozenUiLock}
                  onClick={onGoToClinicalDashboardFromStreak}
                  onKeyDown={(e) => activateOnEnterSpace(e, onGoToClinicalDashboardFromStreak)}
                  className="mx-auto text-xs font-black tabular-nums px-2.5 py-1 rounded-xl border w-fit max-w-full shrink-0 cursor-pointer touch-manipulation motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 hover:brightness-[1.03] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:opacity-40 disabled:pointer-events-none"
                  style={{
                    borderColor: 'rgba(249, 115, 22, 0.45)',
                    background: 'linear-gradient(135deg, rgba(255, 247, 237, 0.95), #fff7ed)',
                    color: '#9a3412',
                    boxShadow: '0 0 12px rgba(251, 146, 60, 0.2)',
                  }}
                  title="רצף ימים — מעבר ללוח קליני"
                  aria-label="רצף ימים — מעבר ללוח קליני"
                >
                  רצף {displayStreak} {displayStreak === 1 ? 'יום' : 'ימים'} 🔥
                </button>
              </div>
            </div>
          </>
        )}
        {patientMustChangePassword && (
          <p
            className="w-full min-w-0 text-lg sm:text-xl font-bold leading-snug tracking-tight text-slate-900 break-words text-center [overflow-wrap:anywhere]"
            dir="rtl"
          >
            {portalPatientLabel}
          </p>
        )}
        {patientMustChangePassword && hasDailyLoginBonusPending && (
          <div className="flex justify-center items-center gap-1.5 flex-wrap" dir="rtl">
            <RewardLabel
              xp={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.xp}
              coins={PATIENT_REWARDS.FIRST_LOGIN_OF_DAY.coins}
            />
            <span className="text-xs text-slate-500">כניסה יומית</span>
          </div>
        )}
      </div>

      {/* טור 3 — ימין: כפתורים */}
      <div className="shrink-0 justify-self-end flex flex-nowrap items-center justify-end gap-1.5">
        {sessionRole === 'patient' ? (
          <>
            <button
              type="button"
              onClick={onOpenRedFlag}
              title="דיווח דחוף — Red Flag"
              className="flex shrink-0 items-center justify-center min-h-11 min-w-11 rounded-xl border border-red-200 bg-red-50/90 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors"
              aria-label="דיווח דחוף — Red Flag"
            >
              <span
                className="red-flag-siren-stage inline-flex h-6 w-6 items-center justify-center [direction:ltr]"
                aria-hidden
              >
                <span className="red-flag-siren-rotor inline-flex h-6 w-6 items-center justify-center">
                  {redFlagSirenAssetFailed ? (
                    <Siren className="h-6 w-6 shrink-0" strokeWidth={2.25} />
                  ) : (
                    <img
                      src="/image_5f21a1.png"
                      alt=""
                      width={24}
                      height={24}
                      decoding="async"
                      draggable={false}
                      className="h-6 w-6 max-h-6 object-contain pointer-events-none select-none"
                      style={{ transform: 'translateZ(0.5px)' }}
                      onError={onRedFlagSirenAssetFailed}
                    />
                  )}
                </span>
              </span>
            </button>
            {!patientMustChangePassword && (
              <button
                type="button"
                disabled={portalFrozenUiLock}
                onClick={onOpenSettings}
                title="הגדרות"
                className="flex shrink-0 items-center justify-center min-h-11 min-w-11 rounded-xl hover:bg-slate-50 border border-slate-200 text-slate-700 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="הגדרות"
              >
                <Settings className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              title="התנתקות"
              className="flex shrink-0 items-center justify-center gap-1 min-h-11 ps-2 pe-2.5 rounded-xl hover:bg-slate-50 border border-slate-200 text-slate-700"
              aria-label="התנתקות"
            >
              <LogOut className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="text-sm font-semibold hidden sm:inline">יציאה</span>
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
