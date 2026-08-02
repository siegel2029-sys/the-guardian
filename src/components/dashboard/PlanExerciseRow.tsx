import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Trash2, Pencil, Check, ChevronDown, ChevronUp, Sparkles, MessageSquare, Film,
} from 'lucide-react';
import type { PatientExercise } from '../../types';
import { formatTime } from '../../utils/formatExerciseTime';
import {
  formatExerciseBodyAreaLabels,
  formatExerciseMuscleGroups,
} from '../../utils/exerciseTargeting';
import ExerciseVideoUrlField from './ExerciseVideoUrlField';
import {
  CUSTOM_NOTE_MAX_LEN,
  INSTRUCTIONS_MAX_LEN,
  TEXTAREA_MIN_PX,
  typeBg,
  typeText,
  typeLabel,
} from './planBuilderShared';

function normalizeCustomInstructionsForStore(raw: string): string | undefined {
  const capped = raw.slice(0, CUSTOM_NOTE_MAX_LEN);
  return capped.trim() === '' ? undefined : capped;
}

export interface PlanExerciseRowProps {
  exercise: PatientExercise;
  onRemove: () => void;
  onUpdate: (
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
  ) => void;
  /** Parent calls registered flushes before global Save (draft may lag exercisePlans state). */
  onRegisterPendingFlush?: (flush: () => void) => () => void;
}

export default function PlanExerciseRow({
  exercise,
  onRemove,
  onUpdate,
  onRegisterPendingFlush,
}: PlanExerciseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState(exercise.instructions ?? '');
  const instructionsDraftRef = useRef(instructionsDraft);
  instructionsDraftRef.current = instructionsDraft;
  const [editSets, setEditSets] = useState(exercise.patientSets);
  const [editReps, setEditReps] = useState(exercise.patientReps);
  const [nameDraft, setNameDraft] = useState(exercise.name);
  const [videoUrlDraft, setVideoUrlDraft] = useState(exercise.videoUrl ?? '');
  const [therapistNotesDraft, setTherapistNotesDraft] = useState(
    exercise.customInstructions ?? ''
  );
  const therapistNotesDraftRef = useRef(therapistNotesDraft);
  therapistNotesDraftRef.current = therapistNotesDraft;
  const [noteSaveFlash, setNoteSaveFlash] = useState(false);
  const notesTaRef = useRef<HTMLTextAreaElement>(null);
  const noteSaveFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notesFieldId = `therapist-notes-${exercise.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const persistCustomInstructionsFromDraft = useCallback(
    (raw: string, options?: { showFlash?: boolean }) => {
      const capped = raw.slice(0, CUSTOM_NOTE_MAX_LEN);
      setTherapistNotesDraft(capped);
      onUpdate({ customInstructions: normalizeCustomInstructionsForStore(capped) });
      if (options?.showFlash) {
        setNoteSaveFlash(true);
        if (noteSaveFlashTimerRef.current) clearTimeout(noteSaveFlashTimerRef.current);
        noteSaveFlashTimerRef.current = setTimeout(() => {
          setNoteSaveFlash(false);
          noteSaveFlashTimerRef.current = null;
        }, 1400);
      }
    },
    [onUpdate]
  );

  useEffect(
    () => () => {
      if (noteSaveFlashTimerRef.current) clearTimeout(noteSaveFlashTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (expanded) return;
    setTherapistNotesDraft(exercise.customInstructions ?? '');
  }, [exercise.customInstructions, exercise.id, expanded]);

  useEffect(() => {
    if (expanded) return;
    setInstructionsDraft(exercise.instructions ?? '');
  }, [exercise.instructions, exercise.id, expanded]);

  useEffect(() => {
    setNameDraft(exercise.name);
  }, [exercise.name, exercise.id]);

  useEffect(() => {
    setVideoUrlDraft(exercise.videoUrl ?? '');
  }, [exercise.videoUrl, exercise.id]);

  useEffect(() => {
    if (!expanded) {
      setEditSets(exercise.patientSets);
      setEditReps(exercise.patientReps);
    }
  }, [exercise.patientSets, exercise.patientReps, exercise.id, expanded]);

  useEffect(() => {
    if (!onRegisterPendingFlush) return;
    const flush = () => {
      if (!expanded) return;
      const capped = instructionsDraftRef.current.slice(0, INSTRUCTIONS_MAX_LEN);
      onUpdate({
        instructions: capped,
        customInstructions: normalizeCustomInstructionsForStore(
          therapistNotesDraftRef.current
        ),
        patientSets: editSets,
        patientReps: editReps,
        videoUrl: videoUrlDraft.trim(),
      });
    };
    return onRegisterPendingFlush(flush);
  }, [
    onRegisterPendingFlush,
    expanded,
    onUpdate,
    editSets,
    editReps,
    videoUrlDraft,
  ]);

  const persistVideoUrl = useCallback(
    (raw: string) => {
      setVideoUrlDraft(raw);
      onUpdate({ videoUrl: raw.trim() });
    },
    [onUpdate]
  );

  /** SAFEGUARD 1: name change clears videoUrl to prevent mismatched clips. */
  const persistCustomName = useCallback(
    (raw: string) => {
      const next = raw.slice(0, 60);
      setNameDraft(next);
      const trimmed = next.trim();
      if (!trimmed || trimmed === exercise.name) return;
      const hadVideo =
        (exercise.videoUrl ?? '').trim().length > 0 || videoUrlDraft.trim().length > 0;
      if (hadVideo) {
        setVideoUrlDraft('');
        onUpdate({ name: trimmed, videoUrl: '' });
      } else {
        onUpdate({ name: trimmed });
      }
    },
    [exercise.name, exercise.videoUrl, videoUrlDraft, onUpdate]
  );

  const persistInstructionsFromDraft = useCallback(
    (raw: string) => {
      const capped = raw.slice(0, INSTRUCTIONS_MAX_LEN);
      setInstructionsDraft(capped);
      onUpdate({ instructions: capped });
    },
    [onUpdate]
  );

  useLayoutEffect(() => {
    const el = notesTaRef.current;
    if (!el || !expanded) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(TEXTAREA_MIN_PX, el.scrollHeight)}px`;
  }, [expanded, therapistNotesDraft]);

  const isTimeBased = exercise.patientReps === 0 && !!exercise.holdSeconds;
  const effectiveType = exercise.isCustom ? 'custom' : exercise.type;
  const doseLabel = isTimeBased
    ? `${exercise.patientSets} × ${formatTime(exercise.holdSeconds!)}`
    : `${exercise.patientSets} × ${exercise.patientReps}`;
  const hasInstructions = Boolean(exercise.instructions?.trim());
  const hasNotes = Boolean(exercise.customInstructions?.trim());
  const hasVideo = Boolean((exercise.videoUrl ?? '').trim() || videoUrlDraft.trim());

  const openExpanded = () => {
    setEditSets(exercise.patientSets);
    setEditReps(exercise.patientReps);
    setExpanded(true);
  };

  const collapseAndFlush = () => {
    onUpdate({
      patientSets: editSets,
      patientReps: editReps,
      instructions: instructionsDraft.slice(0, INSTRUCTIONS_MAX_LEN),
      customInstructions: normalizeCustomInstructionsForStore(therapistNotesDraft),
      videoUrl: videoUrlDraft.trim(),
    });
    setExpanded(false);
  };

  return (
    <div
      className="rounded-xl border-2 shadow-sm transition-all duration-200 w-full min-w-0"
      style={{
        borderColor: expanded ? '#0d9488' : exercise.isCustom ? '#fdba74' : '#cbd5e1',
        background: expanded ? '#f0fffe' : exercise.isCustom ? '#fffbf5' : '#ffffff',
        boxShadow: expanded
          ? '0 0 0 2px rgba(13,148,136,0.16), 0 4px 12px rgba(15,23,42,0.08)'
          : '0 2px 8px rgba(15,23,42,0.06)',
      }}
      dir="rtl"
    >
      {/* Collapsed summary — dense single row */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 min-h-[48px]">
        <button
          type="button"
          onClick={() => (expanded ? collapseAndFlush() : openExpanded())}
          aria-expanded={expanded}
          aria-label={expanded ? 'כווץ פרטי תרגיל' : 'הרחב פרטי תרגיל'}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-teal-600" aria-hidden />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden />
          )}
        </button>

        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
            {exercise.isCustom && expanded ? (
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => persistCustomName(e.target.value)}
                onBlur={() => {
                  const trimmed = nameDraft.trim();
                  if (!trimmed) setNameDraft(exercise.name);
                }}
                maxLength={60}
                aria-label="שם תרגיל מותאם"
                className="text-sm font-semibold text-slate-800 break-words min-w-0 flex-1 rounded-lg border border-orange-200 bg-white px-2 py-0.5 focus:outline-none focus:border-teal-400"
              />
            ) : (
              <span className="text-sm font-semibold text-slate-800 truncate">
                {exercise.name}
              </span>
            )}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
              style={{ background: typeBg[effectiveType], color: typeText[effectiveType] }}
            >
              {exercise.isCustom ? (
                <span className="flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" aria-hidden />
                  מותאם
                </span>
              ) : (
                typeLabel[exercise.type]
              )}
            </span>
            {exercise.isOptional && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                לבחירה
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 text-xs text-slate-500 truncate">
            <span className="text-teal-600 font-medium truncate">
              {formatExerciseMuscleGroups(exercise)}
            </span>
            <span className="text-slate-300 shrink-0" aria-hidden>
              ·
            </span>
            <span className="truncate">{formatExerciseBodyAreaLabels(exercise)}</span>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
          <span
            className="text-sm font-bold text-slate-800 tabular-nums whitespace-nowrap px-1.5"
            title={isTimeBased ? 'סטים × זמן' : "סטים × חזרות"}
          >
            {doseLabel}
          </span>
          {!expanded && (hasVideo || hasNotes || hasInstructions) && (
            <span
              className="hidden sm:flex items-center gap-0.5 text-slate-400"
              title={[
                hasVideo ? 'סרטון' : null,
                hasNotes ? 'הנחיות' : null,
                hasInstructions ? 'הוראות' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {hasVideo && <Film className="w-3.5 h-3.5" aria-hidden />}
              {hasNotes && <MessageSquare className="w-3.5 h-3.5 text-teal-500" aria-hidden />}
              {hasInstructions && <Pencil className="w-3.5 h-3.5 text-teal-500" aria-hidden />}
            </span>
          )}
          {!expanded && (
            <button
              type="button"
              onClick={openExpanded}
              aria-label="ערוך תרגיל"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-teal-600" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label="הסר מהתוכנית"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" aria-hidden />
          </button>
        </div>
      </div>

      {/* Expanded editors — only when editing */}
      {expanded && (
        <div className="border-t border-teal-100/80 px-3 pb-3 pt-2 space-y-3 bg-white/70">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <label className="text-[9px] text-slate-400 mb-0.5">סטים</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editSets}
                  onChange={(e) => {
                    const next = Math.max(1, +e.target.value);
                    setEditSets(next);
                    onUpdate({ patientSets: next, patientReps: editReps });
                  }}
                  className="w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none"
                  style={{ borderColor: '#0d9488' }}
                />
              </div>
              {!isTimeBased && (
                <>
                  <span className="text-slate-400 text-sm pb-1">×</span>
                  <div className="flex flex-col items-center">
                    <label className="text-[9px] text-slate-400 mb-0.5">חזרות</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={editReps}
                      onChange={(e) => {
                        const next = Math.max(1, +e.target.value);
                        setEditReps(next);
                        onUpdate({ patientSets: editSets, patientReps: next });
                      }}
                      className="w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none"
                      style={{ borderColor: '#0d9488' }}
                    />
                  </div>
                </>
              )}
              {isTimeBased && (
                <span className="text-xs text-slate-500 pb-1.5">
                  × {formatTime(exercise.holdSeconds!)}
                </span>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer whitespace-nowrap pb-1.5">
              <input
                type="checkbox"
                checked={exercise.isOptional === true}
                onChange={(e) => onUpdate({ isOptional: e.target.checked })}
                className="rounded border-slate-300 text-teal-600"
              />
              לבחירה (אופציונלי)
            </label>
            <button
              type="button"
              onClick={collapseAndFlush}
              className="ms-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}
            >
              <Check className="w-3.5 h-3.5" aria-hidden />
              סיום עריכה
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ExerciseVideoUrlField
              id={`plan-exercise-video-${exercise.id.replace(/[^a-zA-Z0-9_-]/g, '')}`}
              value={videoUrlDraft}
              onChange={persistVideoUrl}
            />
            <div className="min-w-0">
              <label
                htmlFor={`plan-instructions-${exercise.id.replace(/[^a-zA-Z0-9_-]/g, '')}`}
                className="text-xs font-medium text-slate-600 mb-1 block"
              >
                הוראות ביצוע
              </label>
              <textarea
                id={`plan-instructions-${exercise.id.replace(/[^a-zA-Z0-9_-]/g, '')}`}
                value={instructionsDraft}
                onChange={(e) => persistInstructionsFromDraft(e.target.value)}
                rows={3}
                maxLength={INSTRUCTIONS_MAX_LEN}
                placeholder="הוראות לביצוע התרגיל — יוצגו למטופל"
                className="w-full min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/25 resize-none bg-white text-slate-800"
              />
              <p className="text-[9px] text-slate-400 mt-0.5 tabular-nums text-left">
                {instructionsDraft.length}/{INSTRUCTIONS_MAX_LEN}
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor={notesFieldId} className="text-xs font-medium text-slate-600 mb-1 block">
              הנחיות מהמטפל — יוצגו למטופל לפני הוראות ברירת המחדל
            </label>
            <div className="flex items-start gap-2 w-full min-w-0">
              <textarea
                ref={notesTaRef}
                id={notesFieldId}
                value={therapistNotesDraft}
                onChange={(e) => persistCustomInstructionsFromDraft(e.target.value)}
                onBlur={(e) =>
                  persistCustomInstructionsFromDraft(e.currentTarget.value, { showFlash: true })
                }
                rows={2}
                maxLength={CUSTOM_NOTE_MAX_LEN}
                placeholder="הוסף הנחיות אישיות כאן..."
                className="flex-1 min-w-0 min-h-[3.25rem] px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/25 resize-none bg-white text-slate-800 placeholder:text-slate-400 overflow-hidden"
              />
              <button
                type="button"
                onClick={() =>
                  persistCustomInstructionsFromDraft(therapistNotesDraft, { showFlash: true })
                }
                aria-label="שמור הערה"
                className={`mt-0.5 shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                  noteSaveFlash
                    ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm scale-105'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-300 hover:bg-teal-50/80'
                }`}
              >
                <Check className={`w-4 h-4 ${noteSaveFlash ? 'text-teal-600' : ''}`} aria-hidden />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 mt-1 text-left tabular-nums">
              {therapistNotesDraft.length}/{CUSTOM_NOTE_MAX_LEN}
              {noteSaveFlash ? (
                <span className="text-teal-600 font-semibold mr-2">נשמר</span>
              ) : null}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
