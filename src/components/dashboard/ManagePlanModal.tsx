import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  X, BookOpen, ClipboardList, Sparkles, AlertCircle, Loader2,
} from 'lucide-react';
import {
  usePatientRoster,
  usePatientExercisePlans,
  usePatientCloudSync,
} from '../../context/patientDomainHooks';
import { useExerciseCatalog } from '../../hooks/useExerciseCatalog';
import type { Exercise, PatientExercise } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import { normalizeCachedPatientExercises, pickCanonicalExercisePlan } from '../../utils/exercisePlanCanonical';
import { formatTime } from '../../utils/formatExerciseTime';
import { devError, devLog, redactId } from '../../lib/safeLog';
import CustomExerciseForm, { type CustomFormData } from './CustomExerciseForm';
import CatalogPane, { CustomExerciseModalShell } from './CatalogPane';
import ActivePlanPane from './ActivePlanPane';

/** Re-export for existing consumers that import formatTime from this module. */
export { formatTime };

interface ManagePlanModalProps {
  onClose: () => void;
}

type MobilePane = 'catalog' | 'plan';

export default function ManagePlanModal({ onClose }: ManagePlanModalProps) {
  const { selectedPatient } = usePatientRoster();
  const {
    getExercisePlan,
    addExerciseToPlan,
    removeExerciseFromPlan,
    updateExerciseInPlan,
    replaceExercisePlanForPatient,
    readExercisePlanSnapshot,
    exercisePlans,
  } = usePatientExercisePlans();
  const {
    persistExercisePlanCacheForPatient,
    saveExercisePlanForPatientToCloud,
    supabaseConfigured,
    supabaseSyncStatus,
    supabaseSyncError,
  } = usePatientCloudSync();
  const { activeExercises: exerciseLibrary } = useExerciseCatalog({
    includeInactive: false,
  });

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [libraryToast, setLibraryToast] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [mobilePane, setMobilePane] = useState<MobilePane>('plan');
  const [catalogFullOpen, setCatalogFullOpen] = useState(false);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const pendingFlushesRef = useRef(new Set<() => void>());
  const libraryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerPendingFlush = useCallback((flush: () => void) => {
    pendingFlushesRef.current.add(flush);
    return () => {
      pendingFlushesRef.current.delete(flush);
    };
  }, []);

  const plan = selectedPatient ? getExercisePlan(selectedPatient.id) : undefined;
  const currentExercises = useMemo(() => plan?.exercises ?? [], [plan]);
  const patientId = selectedPatient?.id ?? '';

  /** Sync catalog video URLs into in-memory plan when opening (legacy DB rows → exercise_catalog cache). */
  useEffect(() => {
    if (!selectedPatient) return;
    if (!exerciseLibrary.length) return;
    const rawPlan = pickCanonicalExercisePlan(exercisePlans, selectedPatient.id);
    if (!rawPlan?.exercises.length) return;
    const merged = normalizeCachedPatientExercises(rawPlan.exercises);
    const videoUrlsChanged = merged.some(
      (ex, i) => ex.videoUrl !== (rawPlan.exercises[i]?.videoUrl ?? '')
    );
    if (!videoUrlsChanged) return;
    replaceExercisePlanForPatient(selectedPatient.id, merged);
  }, [
    selectedPatient?.id,
    exercisePlans,
    replaceExercisePlanForPatient,
    exerciseLibrary.length,
  ]);

  useEffect(
    () => () => {
      if (libraryToastTimerRef.current) clearTimeout(libraryToastTimerRef.current);
    },
    []
  );

  /**
   * Strict background scroll lock while the plan builder (and expanded catalog) is open.
   * Locks html/body + dashboard main, freezes body position for iOS, and blocks
   * touchmove outside plan-builder scroll regions.
   */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.getElementById('therapist-dashboard-main');
    const scrollY = window.scrollY;

    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      mainOverflow: main?.style.overflow ?? '',
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (main) main.style.overflow = 'hidden';

    const blockTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-plan-builder-scroll]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      if (main) main.style.overflow = prev.mainOverflow;
      document.removeEventListener('touchmove', blockTouchMove);
      window.scrollTo(0, scrollY);
    };
  }, []);

  /** Escape closes nested modals first (custom → full catalog). */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (customFormOpen) {
        e.stopPropagation();
        setCustomFormOpen(false);
        return;
      }
      if (catalogFullOpen) {
        e.stopPropagation();
        setCatalogFullOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [catalogFullOpen, customFormOpen]);

  const currentIds = useMemo(() => {
    if (!patientId) return new Set<string>();
    return new Set(
      currentExercises.map((e) => e.id.replace(`${patientId}-`, '').replace(/-\d+$/, ''))
    );
  }, [currentExercises, patientId]);

  const isAddedToLibrary = (libId: string) =>
    currentIds.has(libId) || currentExercises.some((e) => e.id.includes(libId));

  const findPlanExerciseIdForLibrary = (libId: string): string | null => {
    const hit = currentExercises.find((e) => e.id === libId || e.id.includes(libId));
    return hit?.id ?? null;
  };

  const showSuccess = useCallback((msg: string, ms = 2800) => {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), ms);
  }, []);

  const showLibraryToast = useCallback((msg: string) => {
    setLibraryToast(msg);
    if (libraryToastTimerRef.current) clearTimeout(libraryToastTimerRef.current);
    libraryToastTimerRef.current = setTimeout(() => {
      setLibraryToast(null);
      libraryToastTimerRef.current = null;
    }, 2200);
  }, []);

  const resolveExercisesForCloudSave = useCallback((): PatientExercise[] => {
    if (!selectedPatient) return [];
    flushSync(() => {
      pendingFlushesRef.current.forEach((flush) => flush());
    });
    const snap = readExercisePlanSnapshot(selectedPatient.id);
    return snap.length > 0 ? snap : normalizeCachedPatientExercises(currentExercises);
  }, [currentExercises, readExercisePlanSnapshot, selectedPatient]);

  if (!selectedPatient) return null;

  const handlePlanExerciseUpdate = (
    exerciseId: string,
    updates: Partial<
      Pick<
        PatientExercise,
        | 'patientReps'
        | 'patientSets'
        | 'isOptional'
        | 'customInstructions'
        | 'instructions'
        | 'videoUrl'
        | 'name'
      >
    >
  ) => {
    flushSync(() => {
      updateExerciseInPlan(selectedPatient.id, exerciseId, updates);
    });
    const snap = readExercisePlanSnapshot(selectedPatient.id);
    const base = snap.length > 0 ? snap : currentExercises;
    const nextExercises = base.map((e) =>
      e.id === exerciseId ? { ...e, ...updates } : e
    );
    void persistExercisePlanCacheForPatient(selectedPatient.id, nextExercises);
  };

  const handleAddLibrary = (exercise: Exercise, isOptional: boolean) => {
    addExerciseToPlan(selectedPatient.id, { ...exercise, isOptional });
    // Stay on Catalog for bulk-add on mobile — toast only, no tab switch.
    showLibraryToast(`נוסף לתוכנית: ${exercise.name}`);
  };

  const handleRemoveFromPlan = (exerciseId: string) => {
    removeExerciseFromPlan(selectedPatient.id, exerciseId);
  };

  const handleAddCustom = (data: CustomFormData) => {
    const xpReward = data.difficulty * 8 + 12;
    const computedHoldSeconds =
      data.mode === 'time' ? data.minutes * 60 + data.seconds : undefined;
    const customId = `patient-${selectedPatient.id}-custom-${Date.now()}`;
    const muscleGroups = [...data.muscleGroups];
    const targetAreas = [...data.targetAreas];
    const newEntry: PatientExercise = {
      id: customId,
      name: data.name.trim(),
      muscleGroup: muscleGroups.join(' · '),
      muscleGroups,
      targetArea: targetAreas[0],
      targetAreas,
      sets: data.sets,
      reps: data.mode === 'reps' ? data.reps : undefined,
      holdSeconds: computedHoldSeconds,
      difficulty: data.difficulty,
      type: 'standard',
      instructions: data.instructions.trim(),
      xpReward,
      isCustom: true,
      isOptional: data.isOptional,
      videoPlaceholder: `${data.name} – הדגמה`,
      videoUrl: data.videoUrl.trim(),
      patientSets: data.sets,
      patientReps: data.mode === 'reps' ? data.reps ?? 10 : 0,
      addedAt: new Date().toISOString(),
    };

    const nextExercises = [...currentExercises, newEntry];
    replaceExercisePlanForPatient(selectedPatient.id, nextExercises);
    void persistExercisePlanCacheForPatient(selectedPatient.id, nextExercises);

    // Custom exercises need immediate setup — close nested modals and open Active Plan.
    setCustomFormOpen(false);
    setCatalogFullOpen(false);
    setMobilePane('plan');
    showSuccess(`התרגיל נוסף בהצלחה: ${data.name.trim()}`);
  };

  const catalogProps = {
    exerciseLibrary,
    isAddedToLibrary,
    findPlanExerciseIdForLibrary,
    onAddLibrary: handleAddLibrary,
    onRemoveLibrary: handleRemoveFromPlan,
    libraryToast,
    onRequestOpenFullCatalog: () => setCatalogFullOpen(true),
    onRequestCloseFullCatalog: () => setCatalogFullOpen(false),
    onRequestOpenCustom: () => setCustomFormOpen(true),
  };

  const planProps = {
    exercises: currentExercises,
    successMsg,
    onRemove: handleRemoveFromPlan,
    onUpdate: handlePlanExerciseUpdate,
    onRegisterPendingFlush: registerPendingFlush,
  };

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-4 overscroll-none"
      style={{ background: 'rgba(0,0,0,0.52)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white shadow-2xl w-full max-w-7xl h-[100dvh] sm:h-[90vh] sm:max-h-[920px] rounded-none sm:rounded-2xl overflow-hidden flex flex-col min-h-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-plan-title"
        dir="rtl"
      >
        {/* Header — sticky */}
        <header
          className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b shrink-0"
          style={{ background: 'linear-gradient(135deg,#f0fffe,#e8f5f0)', borderColor: '#e0f2f1' }}
        >
          <div className="min-w-0">
            <h2 id="manage-plan-title" className="text-lg font-bold text-slate-800">
              ניהול תוכנית תרגול
            </h2>
            <p className="text-sm text-teal-600 mt-0.5 truncate">
              {getPatientDisplayName(selectedPatient)} — {selectedPatient.diagnosis}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug hidden sm:block">
              עריכה במסך מתעדכנת ברשימה; לחץ «שמירה» לעדכון exercise_plans ב-Supabase.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-red-50 transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-slate-500" aria-hidden />
          </button>
        </header>

        {/* Mobile tabs */}
        <div
          className="lg:hidden shrink-0 flex border-b border-slate-200 bg-white p-1.5 gap-1"
          role="tablist"
          aria-label="תצוגת בונה תוכנית"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'catalog'}
            onClick={() => setMobilePane('catalog')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all min-h-[44px]"
            style={
              mobilePane === 'catalog'
                ? { background: '#f0fffe', color: '#0d9488', border: '1px solid #99f6e4' }
                : { background: 'transparent', color: '#64748b' }
            }
          >
            <BookOpen className="w-4 h-4" aria-hidden />
            קטלוג
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'plan'}
            onClick={() => setMobilePane('plan')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all min-h-[44px]"
            style={
              mobilePane === 'plan'
                ? { background: '#f0fffe', color: '#0d9488', border: '1px solid #99f6e4' }
                : { background: 'transparent', color: '#64748b' }
            }
          >
            <ClipboardList className="w-4 h-4" aria-hidden />
            תוכנית פעילה
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: '#ccfbf1', color: '#0d9488' }}
            >
              {currentExercises.length}
            </span>
          </button>
        </div>

        {/* Body — fills remaining height between header and footer */}
        <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
          {/* Desktop: catalog ~35% / plan ~65%; grid-rows 1fr fills height (avoids empty gap) */}
          <div
            className="hidden lg:grid lg:grid-cols-[minmax(340px,35%)_1fr] lg:grid-rows-[minmax(0,1fr)] flex-1 min-h-0 h-full overflow-hidden"
            dir="ltr"
          >
            <CatalogPane
              {...catalogProps}
              className="border-e border-slate-200 min-h-0 h-full max-h-full overflow-hidden"
            />
            <ActivePlanPane
              {...planProps}
              className="min-h-0 h-full max-h-full overflow-hidden"
            />
          </div>

          {/* Mobile: one pane at a time */}
          <div className="lg:hidden flex-1 min-h-0 h-full overflow-hidden flex flex-col">
            {mobilePane === 'catalog' ? (
              <CatalogPane
                {...catalogProps}
                className="flex-1 min-h-0 h-full max-h-full overflow-hidden"
              />
            ) : (
              <ActivePlanPane
                {...planProps}
                className="flex-1 min-h-0 h-full max-h-full overflow-hidden"
              />
            )}
          </div>
        </div>

        {/* Footer — sticky actions */}
        <footer
          className="px-4 sm:px-6 py-3 border-t shrink-0 flex flex-col gap-3"
          style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
        >
          <div className="w-full">
            <label
              htmlFor="plan-change-summary"
              className="block text-xs font-semibold text-slate-600 mb-1"
            >
              סיכום השינויים
            </label>
            <textarea
              id="plan-change-summary"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              rows={2}
              placeholder="קצר — יישמר בגרסת התוכנית בענן (אופציונלי)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40 bg-white resize-none"
            />
          </div>
          {!supabaseConfigured && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
              Supabase לא מוגדר — השמירה תעדכן רק את הנתונים המקומיים.
            </p>
          )}
          {supabaseSyncError && supabaseSyncStatus === 'error' && (
            <p className="text-xs text-red-600">{supabaseSyncError}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orange-400 shrink-0" aria-hidden />
              תרגילים מותאמים מסומנים בכתום
            </span>
            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors min-h-11"
              >
                סגור
              </button>
              <button
                type="button"
                disabled={supabaseSyncStatus === 'saving'}
                onClick={async () => {
                  setSuccessMsg(null);
                  const latestExercises = resolveExercisesForCloudSave();
                  if (import.meta.env.DEV) {
                    console.log('[ManagePlanModal] cloud save payload instructions sample', {
                      patientRef: redactId(selectedPatient.id),
                      exercises: latestExercises.map((e) => ({
                        id: e.id,
                        instructions: e.instructions,
                        customInstructions: e.customInstructions,
                      })),
                    });
                  }
                  const res = await saveExercisePlanForPatientToCloud(
                    selectedPatient.id,
                    latestExercises,
                    { changeSummary: changeSummary.trim(), forceSave: true }
                  );
                  if (res.ok) {
                    setMobilePane('plan');
                    showSuccess('נשמר לענן בהצלחה (exercise_plans).');
                    devLog('[ManagePlanModal] exercise plan saved to cloud', {
                      patientRef: redactId(selectedPatient.id),
                    });
                  } else if (!supabaseConfigured) {
                    showSuccess('Supabase לא מוגדר — עודכנה רק המצב המקומי.', 4000);
                  } else {
                    devError('[ManagePlanModal] cloud plan save failed', { reason: res.message });
                    showSuccess(`שמירה לענן נכשלה: ${res.message}`, 5000);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-55 disabled:cursor-not-allowed transition-all hover:brightness-105"
                style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}
              >
                {supabaseSyncStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                    שומר…
                  </>
                ) : (
                  'שמירה'
                )}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>

    {catalogFullOpen && (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center p-0 sm:p-5 overscroll-none"
        style={{ background: 'rgba(15, 23, 42, 0.55)' }}
        onClick={() => setCatalogFullOpen(false)}
        role="presentation"
      >
        <div
          className="bg-white shadow-2xl w-full max-w-5xl h-[100dvh] sm:h-[min(94dvh,960px)] rounded-none sm:rounded-2xl overflow-hidden flex flex-col min-h-0 border border-teal-100"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="קטלוג תרגילים מלא"
          dir="rtl"
        >
          <CatalogPane
            {...catalogProps}
            variant="expanded"
            className="h-full min-h-0"
          />
        </div>
      </div>
    )}

    {customFormOpen && (
      <CustomExerciseModalShell onClose={() => setCustomFormOpen(false)}>
        <CustomExerciseForm
          onAdd={handleAddCustom}
          onCancel={() => setCustomFormOpen(false)}
        />
      </CustomExerciseModalShell>
    )}
    </>,
    document.body
  );
}
