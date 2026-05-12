import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useLocation } from 'react-router-dom';
import { Lightbulb, ExternalLink, Gift, Lock, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePatient } from '../../context/PatientContext';
import type { KnowledgeFact, Patient } from '../../types';
import { KNOWLEDGE_ENRICHMENT_DISCLAIMER_HE } from '../../config/clinicalDisclaimers';
import { PATIENT_REWARDS } from '../../config/patientRewards';
import { getKnowledgeSourceBadgeText } from '../../utils/knowledgeSourceBadge';
import {
  selectDailyApprovedKnowledgeFact,
  useLocalCalendarDayKey,
} from '../../utils/dailyKnowledgeFact';
import { RewardLabel } from '../ui/RewardLabel';
import PhysioshieldPortal from '../ui/PhysioshieldPortal';

const MOBILE_MAX_WIDTH_PX = 767;

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

const SCROLL_END_THRESHOLD_PX = 40;

const DYK_DEFAULT_TEASER = 'כואב זה לא תמיד "נזק". בוא נבין למה 🤔';

function scrollReachedEnd(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_END_THRESHOLD_PX;
}

export type PatientDidYouKnowAnchorContextValue = {
  visible: boolean;
  openFromTrigger: () => void;
  dykTriggerBulbClass: string;
  cloudTeaser: string;
};

const PatientDidYouKnowAnchorContext = createContext<PatientDidYouKnowAnchorContextValue | null>(
  null
);

export function usePatientDidYouKnowAnchor(): PatientDidYouKnowAnchorContextValue | null {
  return useContext(PatientDidYouKnowAnchorContext);
}

/**
 * «הידעת?» — טריגר מאגר הידע (מנורה); עם `portaledViewportFixed` מוצג דרך PhysioshieldPortal
 * ונשאר קבוע ביחס ל־viewport בזמן גלילה (לא חלק מכרטיס האווטאר).
 */
export function PatientDidYouKnowAnchorButton({
  className,
  align = 'corner',
  portaledViewportFixed = true,
}: {
  /** מחלקות לעטיפת הכפתור (במצב מוטבע — לרוב מיקום absolute יחסית לאב) */
  className?: string;
  /** corner: טבעת פינה בולטת; inline: ללא */
  align?: 'corner' | 'inline';
  /** כפתור יעוגה ל־document.body דרך הפורטל — fixed, מעל תוכן הגלילה */
  portaledViewportFixed?: boolean;
}) {
  const ctx = usePatientDidYouKnowAnchor();
  if (!ctx?.visible) return null;

  const { openFromTrigger, dykTriggerBulbClass, cloudTeaser } = ctx;

  const cornerRing =
    align === 'corner'
      ? 'ring-2 ring-amber-400/35 ring-offset-2 ring-offset-white/90 shadow-[0_0_22px_rgba(251,191,36,0.45)]'
      : '';

  const body = (
    <div
      className={`pointer-events-auto max-md:scale-90 ${portaledViewportFixed ? 'physioshield-dyk-kb-trigger' : 'z-[25]'} ${cornerRing} rounded-full dyk-float-trigger-halo ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={openFromTrigger}
        className="flex h-[2.375rem] w-[2.375rem] min-h-[2.375rem] min-w-[2.375rem] sm:h-12 sm:w-12 sm:min-h-12 sm:min-w-12 cursor-pointer items-center justify-center rounded-full border-2 border-amber-400/90 bg-slate-950/50 shadow-lg shadow-amber-950/25 outline-none backdrop-blur-md transition-[transform,box-shadow] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900/50"
        aria-label={`הידעת? ${cloudTeaser} — הקישו לפתיחה`}
      >
        <span className="sr-only">הידעת? {cloudTeaser} — פתיחת עובדה</span>
        <span className={dykTriggerBulbClass} aria-hidden>
          <Lightbulb
            className="h-[1.1rem] w-[1.1rem] shrink-0 text-amber-100 sm:h-6 sm:w-6"
            strokeWidth={1.45}
            aria-hidden
          />
        </span>
      </button>
    </div>
  );

  if (portaledViewportFixed) {
    return <PhysioshieldPortal layerClassName="physioshield-dyk-kb-portal-layer">{body}</PhysioshieldPortal>;
  }

  return body;
}

function DidYouKnowPortalModal({
  fact,
  isMobile,
  expanded,
  successBurst,
  setSuccessBurst,
  scrollBodyRef,
  onScrollBody,
  onExpandedFocusCapture,
  cancelMobileAutoHide,
  closeExpanded,
  onCollectReward,
  canCollect,
  alreadyClaimed,
  rxp,
  rcoins,
}: {
  fact: KnowledgeFact;
  isMobile: boolean;
  expanded: boolean;
  successBurst: boolean;
  setSuccessBurst: (v: boolean) => void;
  scrollBodyRef: RefObject<HTMLDivElement | null>;
  onScrollBody: () => void;
  onExpandedFocusCapture: () => void;
  cancelMobileAutoHide: () => void;
  closeExpanded: () => void;
  onCollectReward: (articleId: string, options: { readerConfirmed: boolean }) => boolean;
  canCollect: boolean;
  alreadyClaimed: boolean;
  rxp: number;
  rcoins: number;
}) {
  const modalBodyText = (fact.explanation ?? '').trim();

  const handleCollect = () => {
    if (!canCollect) return;
    const ok = onCollectReward(fact.id, { readerConfirmed: true });
    if (ok) {
      setSuccessBurst(true);
      window.setTimeout(() => setSuccessBurst(false), 1400);
    }
  };

  if (!expanded) return null;

  return (
    <div
      className="fixed left-0 right-0 flex items-center justify-center md:inset-0 z-[120] max-md:px-3 p-4 sm:p-6"
      style={
        isMobile
          ? {
              top: 'calc(4.35rem + env(safe-area-inset-top, 0px))',
              bottom: 'calc(5.35rem + env(safe-area-inset-bottom, 0px))',
              background: 'rgba(15, 23, 42, 0.28)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }
          : { top: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.5)' }
      }
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dyk-expanded-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeExpanded();
      }}
    >
      <div
        key={fact.id}
        className={`w-full max-w-2xl max-h-[min(92vh,800px)] flex flex-col rounded-2xl border border-[#0f172a] overflow-hidden relative max-md:max-h-full ${
          isMobile ? 'bg-white/93 shadow-xl shadow-slate-900/15 backdrop-blur-sm' : 'bg-white'
        }`}
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={cancelMobileAutoHide}
        onFocusCapture={onExpandedFocusCapture}
      >
        {successBurst && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 rounded-3xl animate-article-reward-success"
            style={{ background: 'rgba(224, 242, 254, 0.35)' }}
          >
            <span className="text-lg font-black text-emerald-800 drop-shadow-sm">מעולה! הפרס נאסף</span>
          </div>
        )}
        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-b border-blue-100 bg-gradient-to-l from-blue-50/90 to-white">
          <div className="flex items-center gap-2 min-w-0 font-dyk-bubble">
            <Lightbulb className="w-6 h-6 shrink-0 text-[#0f172a]" strokeWidth={1.35} />
            <span className="text-sm font-extrabold text-[#1e40af] tracking-wide">הידעת?</span>
            <RewardLabel xp={rxp} coins={rcoins} />
          </div>
          <button
            type="button"
            onClick={closeExpanded}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 max-md:p-1.5 max-md:rounded-lg max-md:border max-md:border-slate-200/90 max-md:bg-white/95 max-md:shadow-sm"
            aria-label="סגור"
          >
            <X className="w-5 h-5 max-md:w-4 max-md:h-4" strokeWidth={2.25} />
          </button>
        </div>

        <div
          ref={scrollBodyRef}
          onScroll={onScrollBody}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pt-5 scroll-smooth"
        >
          <h2
            id="dyk-expanded-title"
            className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug font-dyk-bubble"
          >
            {fact.title}
          </h2>
          <div className="text-base sm:text-[1.05rem] text-slate-700 leading-[1.75] mt-4 whitespace-pre-wrap break-words font-dyk-bubble">
            {modalBodyText || '—'}
          </div>

          <div
            className="mt-5 rounded-xl border-2 border-slate-400 bg-slate-100/95 px-4 py-3 shadow-inner"
            role="note"
          >
            <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed text-center">
              {KNOWLEDGE_ENRICHMENT_DISCLAIMER_HE}
            </p>
          </div>

          <div className="mt-4 pb-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex max-w-full items-center rounded-full border border-teal-200/90 bg-teal-50/90 px-3 py-1.5 text-[11px] font-bold text-teal-900"
              role="status"
            >
              {getKnowledgeSourceBadgeText(fact.sourceUrl)}
            </span>
          </div>
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 mt-3 w-full min-h-12 text-sm font-bold text-[#1e3a8a] px-4 py-3 rounded-2xl border-2 border-[#1d4ed8] bg-blue-50/80 hover:bg-blue-100 active:bg-blue-100 transition-colors inline-flex items-center justify-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2 font-dyk-bubble"
          >
            <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
            למקור המאמר המלא
          </a>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-5 py-4">
          <button
            type="button"
            onClick={handleCollect}
            disabled={!canCollect || alreadyClaimed}
            className="w-full text-sm font-bold text-white px-4 py-3 rounded-2xl border inline-flex items-center justify-center gap-2 transition-opacity disabled:opacity-45 disabled:cursor-not-allowed bg-gradient-to-l from-teal-600 to-sky-600 border-teal-500 shadow-md"
          >
            {alreadyClaimed ? (
              <>
                <Gift className="w-4 h-4 shrink-0" />
                הפרס נאסף
              </>
            ) : canCollect ? (
              <>
                <Gift className="w-4 h-4 shrink-0" />
                אסוף פרס
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 shrink-0" />
                גללו עד הסוף כדי לאסוף את הפרס
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-500 text-center mt-2 leading-snug">
            הפרס מיועד לקריאת התוכן באפליקציה (כולל ההבהרה); הקישור החיצוני אופציונלי.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PatientDidYouKnowProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { sessionRole, patientMustChangePassword } = useAuth();
  const {
    selectedPatient,
    knowledgeFacts,
    markArticleAsRead,
    hasReadArticle,
    getDidYouKnowTipOpenedLocalYmd,
    recordDidYouKnowTipOpened,
  } = usePatient();

  const dykLocalCalendarDayKey = useLocalCalendarDayKey();
  const isMobile = useIsMobileViewport();

  const approvedFacts = useMemo(
    () => knowledgeFacts.filter((f) => f.isApproved),
    [knowledgeFacts]
  );

  const tipAlreadyOpenedToday = Boolean(
    selectedPatient &&
      getDidYouKnowTipOpenedLocalYmd(selectedPatient.id) === dykLocalCalendarDayKey
  );

  const show =
    sessionRole === 'patient' &&
    location.pathname.startsWith('/patient-portal') &&
    !!selectedPatient &&
    !patientMustChangePassword &&
    approvedFacts.length > 0;

  const patient: Patient | null = selectedPatient ?? null;

  const factFromPicker = useMemo(
    () =>
      show && patient ? selectDailyApprovedKnowledgeFact(approvedFacts, dykLocalCalendarDayKey) : null,
    [approvedFacts, dykLocalCalendarDayKey, show, patient]
  );

  const fact =
    show && patient
      ? factFromPicker ?? (approvedFacts.length > 0 ? approvedFacts[0] : null)
      : null;

  const [expanded, setExpanded] = useState(false);
  const [successBurst, setSuccessBurst] = useState(false);
  const [readThroughContent, setReadThroughContent] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedOpenedAtRef = useRef(0);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current != null) {
      window.clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const cancelMobileAutoHide = useCallback(() => {
    if (isMobile) clearAutoHideTimer();
  }, [isMobile, clearAutoHideTimer]);

  useEffect(() => {
    setSuccessBurst(false);
    setExpanded(false);
    setReadThroughContent(false);
    clearAutoHideTimer();
  }, [patient?.id, fact?.id, clearAutoHideTimer]);

  useEffect(() => {
    if (expanded) expandedOpenedAtRef.current = Date.now();
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !isMobile) {
      clearAutoHideTimer();
      return;
    }
    clearAutoHideTimer();
    autoHideTimerRef.current = window.setTimeout(() => {
      autoHideTimerRef.current = null;
      setExpanded(false);
    }, 7000);
    return clearAutoHideTimer;
  }, [expanded, isMobile, fact?.id, clearAutoHideTimer]);

  useEffect(() => {
    if (!expanded) {
      setReadThroughContent(false);
      return;
    }
    const el = scrollBodyRef.current;
    if (!el) return;

    const measure = () => {
      if (scrollReachedEnd(el)) setReadThroughContent(true);
    };

    measure();
    const t = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.cancelAnimationFrame(t);
      ro.disconnect();
    };
  }, [expanded, fact?.id, fact?.explanation]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const closeExpanded = useCallback(() => {
    clearAutoHideTimer();
    setExpanded(false);
  }, [clearAutoHideTimer]);

  const onScrollBody = useCallback(() => {
    cancelMobileAutoHide();
    const el = scrollBodyRef.current;
    if (!el) return;
    if (scrollReachedEnd(el)) setReadThroughContent(true);
  }, [cancelMobileAutoHide]);

  const onExpandedFocusCapture = useCallback(() => {
    if (!isMobile) return;
    if (Date.now() - expandedOpenedAtRef.current < 450) return;
    clearAutoHideTimer();
  }, [isMobile, clearAutoHideTimer]);

  const onDidYouKnowTriggerOpen = useCallback(() => {
    if (!patient) return;
    recordDidYouKnowTipOpened(patient.id, dykLocalCalendarDayKey);
  }, [patient, recordDidYouKnowTipOpened, dykLocalCalendarDayKey]);

  const openFromTrigger = useCallback(() => {
    onDidYouKnowTriggerOpen();
    setExpanded(true);
  }, [onDidYouKnowTriggerOpen]);

  const showBulbPulse = !tipAlreadyOpenedToday;
  const dykTriggerBulbClass = showBulbPulse
    ? 'dyk-lightbulb-glow-host dyk-lightbulb-pulse-glow'
    : 'dyk-lightbulb-glow-host dyk-lightbulb-solid-glow';

  const cloudTeaser =
    fact && fact.teaser.trim() ? fact.teaser.trim() : DYK_DEFAULT_TEASER;

  const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;

  const alreadyClaimed =
    patient && fact ? hasReadArticle(patient.id, fact.id) : false;
  const canCollect = Boolean(readThroughContent && !alreadyClaimed && fact);

  const onCollectReward = useCallback(
    (articleId: string, options: { readerConfirmed: boolean }) => {
      if (!patient) return false;
      return markArticleAsRead(patient.id, articleId, {
        ...options,
        didYouKnowLocalCalendarYmd: dykLocalCalendarDayKey,
      });
    },
    [patient, markArticleAsRead, dykLocalCalendarDayKey]
  );

  const anchorValue = useMemo<PatientDidYouKnowAnchorContextValue | null>(() => {
    if (!show || !fact) return null;
    return {
      visible: true,
      openFromTrigger,
      dykTriggerBulbClass,
      cloudTeaser,
    };
  }, [show, fact, openFromTrigger, dykTriggerBulbClass, cloudTeaser]);

  return (
    <PatientDidYouKnowAnchorContext.Provider value={anchorValue}>
      {children}
      {patient && fact && (
        <DidYouKnowPortalModal
          fact={fact}
          isMobile={isMobile}
          expanded={expanded}
          successBurst={successBurst}
          setSuccessBurst={setSuccessBurst}
          scrollBodyRef={scrollBodyRef}
          onScrollBody={onScrollBody}
          onExpandedFocusCapture={onExpandedFocusCapture}
          cancelMobileAutoHide={cancelMobileAutoHide}
          closeExpanded={closeExpanded}
          onCollectReward={onCollectReward}
          canCollect={Boolean(canCollect && fact)}
          alreadyClaimed={alreadyClaimed}
          rxp={rxp}
          rcoins={rcoins}
        />
      )}
    </PatientDidYouKnowAnchorContext.Provider>
  );
}
