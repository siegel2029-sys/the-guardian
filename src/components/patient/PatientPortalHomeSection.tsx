import { lazy, Suspense, type RefObject } from 'react';
import { Activity, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ErrorBoundary from '../ui/error-boundary';
import type { Patient, BodyArea, DailyHistoryEntry } from '../../types';
import type { PatientGearState } from '../../context/patientGearUtils';
import { buildEquippedGearSnapshot } from '../../utils/gearSnapshot';
import { normalizeStoreItemIds } from '../../config/storeCatalog';
import PatientTwoMonthGoalCard from './PatientTwoMonthGoalCard';
import ClinicalMonthCalendar from './ClinicalMonthCalendar';
import {
  activateOnEnterSpace,
  portalHrefForTab,
  PORTAL_PROGRESS_NAV_SURFACE,
} from './patientPortalRouting';

const BodyMap3D = lazy(() => import('../body-map/BodyMap3D'));

export interface PatientPortalHomeSectionProps {
  selectedPatient: Patient;
  bodyMapSectionRef: RefObject<HTMLDivElement | null>;
  activeAreas: BodyArea[];
  selectedZones: BodyArea[];
  clinicalToday: string;
  totalActiveDaysForScenery: number;
  displayStreak: number;
  optionalGlowBoost: number;
  strengthenedAreasToday: BodyArea[];
  patientGearState: PatientGearState;
  onAvatarZoneClick: (area: BodyArea) => void;
  patientMustChangePassword: boolean;
  totalMissions: number;
  completedMissionCount: number;
  onGoToDailyProgressTasks: () => void;
  onOpenPainAnalytics: () => void;
  unreadForPatient: number;
  patientDayMap: Record<string, DailyHistoryEntry | undefined>;
  exercisesLength: number;
}

/** בית הפורטל: מפת גוף (lazy + ErrorBoundary) + כרטיס יעד + פס התקדמות יומי */
export default function PatientPortalHomeSection({
  selectedPatient,
  bodyMapSectionRef,
  activeAreas,
  selectedZones,
  clinicalToday,
  totalActiveDaysForScenery,
  displayStreak,
  optionalGlowBoost,
  strengthenedAreasToday,
  patientGearState,
  onAvatarZoneClick,
  patientMustChangePassword,
  totalMissions,
  completedMissionCount,
  onGoToDailyProgressTasks,
  onOpenPainAnalytics,
  unreadForPatient,
  patientDayMap,
  exercisesLength,
}: PatientPortalHomeSectionProps) {
  const navigate = useNavigate();
  const lastPainRecord = selectedPatient.analytics?.painHistory?.slice(-1)?.[0];

  return (
    <section className="mb-5">
      <div className="relative mx-auto w-full max-w-md touch-pan-y">
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 overflow-hidden mx-auto w-full">
          <div
            ref={bodyMapSectionRef}
            className="relative w-full max-w-[300px] mx-auto aspect-[9/16] min-h-[420px] max-h-[min(640px,68dvh)] isolate overscroll-y-contain"
          >
            <ErrorBoundary
              variant="section"
              scopeLabel="PatientDailyView.BodyMap3D"
              fallback={(reset) => (
                <div
                  role="alert"
                  dir="rtl"
                  className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center"
                >
                  <p className="text-sm font-semibold text-slate-900">מפת הגוף אינה זמינה</p>
                  <p className="text-xs text-slate-600">שאר הפורטל ממשיך לעבוד כרגיל.</p>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 min-h-11"
                  >
                    נסה שוב
                  </button>
                </div>
              )}
            >
              <Suspense
                fallback={
                  <div
                    className="flex h-full min-h-[420px] items-center justify-center bg-slate-100/80"
                    aria-busy="true"
                    aria-label="טוען מפת גוף"
                  >
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                  </div>
                }
              >
                <BodyMap3D
                  activeAreas={exercisesLength === 0 ? [] : activeAreas}
                  primaryArea={selectedPatient.primaryBodyArea}
                  clinicalArea={selectedPatient.primaryBodyArea}
                  selfCareSelectedAreas={selectedZones}
                  secondaryClinicalBodyAreas={selectedPatient.secondaryClinicalBodyAreas}
                  stableInteraction={false}
                  patientPortalInteractive
                  dailyScenicBackgroundDayKey={clinicalToday}
                  totalActiveDaysForScenery={totalActiveDaysForScenery}
                  painByArea={selectedPatient.analytics.painByArea}
                  level={selectedPatient.level}
                  xp={selectedPatient.xp}
                  xpForNextLevel={selectedPatient.xpForNextLevel}
                  streak={displayStreak}
                  strengthGlowBonus={optionalGlowBoost}
                  strengthenedAreasToday={strengthenedAreasToday}
                  injuryHighlightSegments={selectedPatient.injuryHighlightSegments}
                  avatarScale={0.9}
                  equippedGear={buildEquippedGearSnapshot(patientGearState)}
                  equippedItems={normalizeStoreItemIds(selectedPatient.equippedItems)}
                  minHeightPx={0}
                  wrapperClassName="h-full w-full min-h-0"
                  onAreaClick={onAvatarZoneClick}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <PatientTwoMonthGoalCard patient={selectedPatient} />

      {!patientMustChangePassword && totalMissions > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={onGoToDailyProgressTasks}
          onKeyDown={(e) => activateOnEnterSpace(e, onGoToDailyProgressTasks)}
          className={`mt-3 rounded-2xl p-4 min-h-[52px] border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/40 shadow-md shadow-emerald-900/5 ${PORTAL_PROGRESS_NAV_SURFACE}`}
          aria-label="התקדמות יומית — מעבר למשימות באימונים"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-bold text-emerald-950">התקדמות היום</span>
            <span className="text-sm font-black tabular-nums text-emerald-800">
              {completedMissionCount}/{totalMissions} משימות
            </span>
          </div>
          <div
            className="h-3 rounded-full bg-emerald-100/90 overflow-hidden border border-emerald-200/60 pointer-events-none"
            aria-hidden
          >
            <div
              className="h-full rounded-full motion-safe:transition-all motion-safe:duration-500 ease-out bg-gradient-to-l from-emerald-500 to-medical-success shadow-sm"
              style={{
                width: `${totalMissions > 0 ? Math.round((completedMissionCount / totalMissions) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {!patientMustChangePassword && (
        <button
          type="button"
          onClick={onOpenPainAnalytics}
          className="mt-4 w-full text-start rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 overflow-hidden cursor-pointer touch-manipulation motion-safe:transition-[box-shadow,transform,border-color] motion-safe:duration-200 hover:shadow-lg hover:border-teal-200/90 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
          aria-label="מעקב כאב — פתיחת גרף וניתוח מגמה"
        >
          <div className="px-4 py-3 border-b border-slate-100/90 bg-slate-50/60 pointer-events-none">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-medical-primary shrink-0" aria-hidden />
              <p className="text-sm font-bold text-slate-900">מעקב כאב</p>
            </div>
          </div>
          <div className="min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 pointer-events-none">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700 leading-snug">
                ממוצע {selectedPatient.analytics.averageOverallPain.toFixed(1)}/10
                {lastPainRecord != null && (
                  <span className="text-slate-600">
                    {' '}
                    · אחרון {lastPainRecord.painLevel}/10
                  </span>
                )}
                {lastPainRecord == null && ' · עדיין אין דיווחים'}
              </p>
            </div>
            <span className="text-sm font-bold text-medical-primary shrink-0">גרף</span>
          </div>
        </button>
      )}

      {unreadForPatient > 0 && (
        <button
          type="button"
          onClick={() => navigate(portalHrefForTab('messages'))}
          className="mt-3 w-full rounded-2xl border-2 border-medical-primary/25 bg-white px-4 py-3 flex items-center justify-between gap-3 text-start shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="w-6 h-6 text-medical-primary shrink-0" />
            <span className="text-base font-bold text-slate-900">הודעות חדשות מהמטפל</span>
          </div>
          <span className="shrink-0 min-w-[1.75rem] h-8 px-2 rounded-full text-sm font-black flex items-center justify-center text-white bg-medical-primary">
            {unreadForPatient > 9 ? '9+' : unreadForPatient}
          </span>
        </button>
      )}
      {!patientMustChangePassword && (
        <div
          id="patient-clinical-dashboard"
          className="scroll-mt-28 mt-10 mb-2 mx-auto w-full max-w-md"
        >
          <ClinicalMonthCalendar dayMap={patientDayMap} clinicalToday={clinicalToday} />
        </div>
      )}
    </section>
  );
}
