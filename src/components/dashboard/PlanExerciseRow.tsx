import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  X, Trash2, Pencil, Check, RotateCcw, Sparkles, MessageSquare,
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
  const [editing, setEditing] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState(exercise.instructions ?? '');
  const instructionsDraftRef = useRef(instructionsDraft);
  instructionsDraftRef.current = instructionsDraft;
  const [editSets, setEditSets] = useState(exercise.patientSets);
  const [editReps, setEditReps] = useState(exercise.patientReps);
  const [nameDraft, setNameDraft] = useState(exercise.name);
  const [videoUrlDraft, setVideoUrlDraft] = useState(exercise.videoUrl ?? '');
  const [therapistNotesOpen, setTherapistNotesOpen] = useState(
    Boolean(exercise.customInstructions?.trim())
  );
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
    // While the notes panel is open the draft is the source of truth — a lagging/refetched
    // parent prop must not clobber the therapist's in-progress edit.
    if (therapistNotesOpen) return;
    setTherapistNotesDraft(exercise.customInstructions ?? '');
  }, [exercise.customInstructions, exercise.id, therapistNotesOpen]);

  useEffect(() => {
    // Same guard for the instructions editor: never reset the textarea mid-edit.
    if (editingInstructions) return;
    setInstructionsDraft(exercise.instructions ?? '');
  }, [exercise.instructions, exercise.id, editingInstructions]);

  useEffect(() => {
    setNameDraft(exercise.name);
  }, [exercise.name, exercise.id]);

  useEffect(() => {
    setVideoUrlDraft(exercise.videoUrl ?? '');
  }, [exercise.videoUrl, exercise.id]);

  useEffect(() => {
    if (!onRegisterPendingFlush) return;
    const flush = () => {
      if (editingInstructions) {
        const capped = instructionsDraftRef.current.slice(0, INSTRUCTIONS_MAX_LEN);
        onUpdate({ instructions: capped });
      }
      if (therapistNotesOpen) {
        onUpdate({
          customInstructions: normalizeCustomInstructionsForStore(
            therapistNotesDraftRef.current
          ),
        });
      }
    };
    return onRegisterPendingFlush(flush);
  }, [onRegisterPendingFlush, editingInstructions, therapistNotesOpen, onUpdate]);

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

  const commitInstructionsDraft = useCallback(
    (options?: { closeEditor?: boolean }) => {
      const trimmed = instructionsDraft.slice(0, INSTRUCTIONS_MAX_LEN).trim();
      setInstructionsDraft(trimmed);
      onUpdate({ instructions: trimmed });
      if (options?.closeEditor) setEditingInstructions(false);
    },
    [instructionsDraft, onUpdate]
  );

  const cancelInstructionsEdit = () => {
    setInstructionsDraft(exercise.instructions ?? '');
    setEditingInstructions(false);
  };

  useLayoutEffect(() => {
    const el = notesTaRef.current;
    if (!el || !therapistNotesOpen) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(TEXTAREA_MIN_PX, el.scrollHeight)}px`;
  }, [therapistNotesOpen, therapistNotesDraft]);

  const saveEditLabels = () => {
    onUpdate({ patientSets: editSets, patientReps: editReps });
    setEditing(false);
  };

  const isTimeBased = exercise.patientReps === 0 && !!exercise.holdSeconds;
  const effectiveType = exercise.isCustom ? 'custom' : exercise.type;

  const toggleTherapistNotesPanel = () => {
    if (therapistNotesOpen) {
      persistCustomInstructionsFromDraft(therapistNotesDraft, { showFlash: true });
    }
    setTherapistNotesOpen((o) => !o);
  };

  return (
    <div
      className="rounded-xl border transition-all duration-200 w-full min-w-0"
      style={{
        borderColor: editing ? '#0d9488' : exercise.isCustom ? '#fdba74' : '#e0f2f1',
        background: editing ? '#f0fffe' : exercise.isCustom ? '#fffbf5' : 'white',
        boxShadow: editing ? '0 0 0 2px rgba(13,148,136,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      dir="rtl"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {exercise.isCustom ? (
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
                className="text-sm font-semibold text-slate-800 break-words min-w-0 flex-1 rounded-lg border border-orange-200 bg-white px-2 py-1 focus:outline-none focus:border-teal-400"
              />
            ) : (
              <span className="text-sm font-semibold text-slate-800 break-words">{exercise.name}</span>
            )}
            {/* Type / Custom badge */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
              style={{ background: typeBg[effectiveType], color: typeText[effectiveType] }}
            >
              {exercise.isCustom ? (
                <span className="flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  מותאם
                </span>
              ) : typeLabel[exercise.type]}
            </span>
            {exercise.isOptional && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                לבחירה
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-teal-600 font-medium break-words">
              {formatExerciseMuscleGroups(exercise)}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{formatExerciseBodyAreaLabels(exercise)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-end gap-2 shrink-0 self-start pt-0.5">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={exercise.isOptional === true}
              onChange={(e) => onUpdate({ isOptional: e.target.checked })}
              className="rounded border-slate-300 text-teal-600"
            />
            לבחירה
          </label>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={saveEditLabels}
                  aria-label="שמור סטים וחזרות"
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50 hover:bg-teal-100 transition-colors"
                >
                  <Check className="w-4 h-4 text-teal-600" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditSets(exercise.patientSets);
                    setEditReps(exercise.patientReps);
                  }}
                  aria-label="בטל עריכת סטים וחזרות"
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleTherapistNotesPanel}
                  aria-label={therapistNotesOpen ? 'סגור הנחיות למטופל' : 'הנחיות אישיות למטופל'}
                  aria-expanded={therapistNotesOpen}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                    exercise.customInstructions?.trim()
                      ? 'bg-teal-50 hover:bg-teal-100'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <MessageSquare
                    className={`w-3.5 h-3.5 ${
                      exercise.customInstructions?.trim() ? 'text-teal-600' : 'text-slate-400'
                    }`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingInstructions((v) => !v);
                    if (editingInstructions) cancelInstructionsEdit();
                  }}
                  aria-label={editingInstructions ? 'סגור עריכת הוראות' : 'ערוך הוראות תרגיל'}
                  aria-expanded={editingInstructions}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                    editingInstructions || exercise.instructions?.trim()
                      ? 'bg-teal-50 hover:bg-teal-100'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <Pencil
                    className={`w-3.5 h-3.5 ${
                      editingInstructions || exercise.instructions?.trim()
                        ? 'text-teal-600'
                        : 'text-slate-400'
                    }`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="ערוך סטים וחזרות"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                  title="סטים וחזרות"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400 hover:text-teal-600" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label="הסר מהתוכנית"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {(editingInstructions || exercise.instructions?.trim()) && !editing && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/80 w-full min-w-0 max-w-3xl">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-slate-600">הוראות ביצוע</span>
            {!editingInstructions && (
              <button
                type="button"
                onClick={() => setEditingInstructions(true)}
                className="text-[10px] font-semibold text-teal-700 hover:text-teal-800 px-2 py-0.5 rounded-lg hover:bg-teal-50"
              >
                עריכה
              </button>
            )}
          </div>
          {editingInstructions ? (
            <>
              <textarea
                value={instructionsDraft}
                onChange={(e) => persistInstructionsFromDraft(e.target.value)}
                onBlur={() => commitInstructionsDraft()}
                rows={4}
                maxLength={INSTRUCTIONS_MAX_LEN}
                placeholder="הוראות לביצוע התרגיל — יוצגו למטופל"
                className="w-full min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/25 resize-none bg-white text-slate-800"
              />
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <p className="text-[9px] text-slate-400 tabular-nums">
                  {instructionsDraft.length}/{INSTRUCTIONS_MAX_LEN}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={cancelInstructionsEdit}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-600 border border-slate-200 hover:bg-white"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={() => commitInstructionsDraft({ closeEditor: true })}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}
                  >
                    שמור
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{exercise.instructions}</p>
          )}
        </div>
      )}
      {therapistNotesOpen && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-white/90 w-full min-w-0 max-w-3xl">
          <label htmlFor={notesFieldId} className="text-[10px] font-bold text-slate-600 block mb-1.5">
            הנחיות מהמטפל — יוצגו למטופל לפני הוראות ברירת המחדל
          </label>
          <div className="flex items-start gap-2 w-full min-w-0">
            <textarea
              ref={notesTaRef}
              id={notesFieldId}
              value={therapistNotesDraft}
              onChange={(e) => persistCustomInstructionsFromDraft(e.target.value)}
              onBlur={(e) => persistCustomInstructionsFromDraft(e.currentTarget.value, { showFlash: true })}
              rows={3}
              maxLength={CUSTOM_NOTE_MAX_LEN}
              placeholder="הוסף הנחיות אישיות כאן..."
              className="flex-1 min-w-0 min-h-[4.5rem] px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/25 resize-none bg-white text-slate-800 placeholder:text-slate-400 overflow-hidden"
            />
            <button
              type="button"
              onClick={() => persistCustomInstructionsFromDraft(therapistNotesDraft, { showFlash: true })}
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
      )}
      <div className="px-3 pb-3 pt-2 border-t border-slate-100 w-full min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-3 lg:gap-4">
          <div className="shrink-0">
            {!editing ? (
              <div className="text-center lg:text-start">
                <div className="text-sm font-bold text-slate-800">
                  {exercise.patientSets} × {isTimeBased
                    ? formatTime(exercise.holdSeconds!)
                    : exercise.patientReps}
                </div>
                <div className="text-[10px] text-slate-400">
                  {isTimeBased ? 'סטים × זמן' : 'סטים × חז\''}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <label className="text-[9px] text-slate-400 mb-0.5">סטים</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editSets}
                    onChange={(e) => setEditSets(Math.max(1, +e.target.value))}
                    className="w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none"
                    style={{ borderColor: '#0d9488' }}
                  />
                </div>
                {!isTimeBased && (
                  <>
                    <span className="text-slate-400 text-sm">×</span>
                    <div className="flex flex-col items-center">
                      <label className="text-[9px] text-slate-400 mb-0.5">חזרות</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={editReps}
                        onChange={(e) => setEditReps(Math.max(1, +e.target.value))}
                        className="w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none"
                        style={{ borderColor: '#0d9488' }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 max-w-xl">
            <ExerciseVideoUrlField
              id={`plan-exercise-video-${exercise.id.replace(/[^a-zA-Z0-9_-]/g, '')}`}
              value={videoUrlDraft}
              onChange={persistVideoUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
