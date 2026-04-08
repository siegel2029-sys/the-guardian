import { useState, useMemo } from 'react';
import {
  X, Plus, Trash2, Pencil, Check, Search, BookOpen,
  ClipboardList, Filter, Clock, RotateCcw, ChevronDown, ChevronUp,
  Wand2, Sparkles, AlertCircle,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { EXERCISE_LIBRARY } from '../../data/mockData';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../../data/exerciseVideoDefaults';
import type { PatientExercise, BodyArea, ExerciseDifficulty } from '../../types';
import { bodyAreaLabels } from '../../types';

interface ManagePlanModalProps {
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────
const MUSCLE_GROUPS_FILTER = ['הכל', 'גב תחתון', 'ליבה', 'ברך', 'ירך', 'כתף', 'קרסול'];
const MUSCLE_GROUPS_SELECT = ['גב תחתון', 'ליבה', 'גב עליון', 'ברך', 'ירך', 'כתף', 'קרסול', 'צוואר', 'פרק יד', 'מרפק', 'כללי'];

const ALL_BODY_AREAS = Object.entries(bodyAreaLabels) as [BodyArea, string][];

const difficultyLabel = ['', 'קל מאוד', 'קל', 'בינוני', 'קשה', 'קשה מאוד'];
const difficultyColor = ['', '#10b981', '#34d399', '#f59e0b', '#f97316', '#ef4444'];
const typeLabel: Record<string, string> = { clinical: 'קליני', standard: 'סטנדרטי', custom: 'מותאם' };
const typeBg: Record<string, string>   = { clinical: '#e0f2fe', standard: '#f3e8ff', custom: '#fff7ed' };
const typeText: Record<string, string> = { clinical: '#0369a1', standard: '#6b21a8', custom: '#c2410c' };

// ── Shared time formatter (M:SS or Xשנ') ─────────────────────────
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0שנ\'';
  if (totalSeconds < 60) return `${totalSeconds}שנ'`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m}:00`;
}

// ── Custom form state ─────────────────────────────────────────────
interface CustomFormData {
  name: string;
  muscleGroup: string;
  targetArea: BodyArea;
  sets: number;
  mode: 'reps' | 'time';
  reps: number;
  minutes: number;   // for time-based: integer minutes (0–60)
  seconds: number;   // for time-based: remaining seconds (0–59)
  difficulty: ExerciseDifficulty;
  instructions: string;
}

const DEFAULT_FORM: CustomFormData = {
  name: '',
  muscleGroup: 'גב תחתון',
  targetArea: 'back_lower',
  sets: 3,
  mode: 'reps',
  reps: 10,
  minutes: 0,
  seconds: 30,
  difficulty: 2,
  instructions: '',
};

// ── Custom Exercise Form ──────────────────────────────────────────
function CustomExerciseForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: CustomFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CustomFormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof CustomFormData>(key: K, value: CustomFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const totalSeconds = form.minutes * 60 + form.seconds;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'נא להזין שם תרגיל';
    if (form.sets < 1 || form.sets > 20) e.sets = '1–20 בלבד';
    if (form.mode === 'reps' && (form.reps < 1 || form.reps > 100)) e.reps = '1–100 בלבד';
    if (form.mode === 'time' && totalSeconds < 5) e.time = 'מינימום 5 שניות';
    if (form.mode === 'time' && totalSeconds > 7200) e.time = 'מקסימום שעתיים';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onAdd(form);
  };

  const inputClass = (err?: string) =>
    `w-full px-3 py-2 text-sm rounded-xl border focus:outline-none transition-all ${err ? 'border-red-400' : 'border-slate-200 focus:border-teal-400'}`;

  return (
    <div
      className="mx-3 mb-3 rounded-2xl border-2 overflow-hidden flex flex-col"
      style={{
        borderColor: '#0d9488',
        background: 'linear-gradient(135deg,#f0fffe,#f8fffb)',
        maxHeight: '72vh',   // outer cap; scrollable fields + sticky button
      }}
      dir="rtl"
    >
      {/* ── Scrollable fields area ─────────────────────────── */}
      <div className="overflow-y-auto flex-1 p-4">

      {/* Form header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}>
          <Wand2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">תרגיל מותאם אישית</p>
          <p className="text-[10px] text-slate-400">יתווסף לתוכנית עם תג "מותאם"</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Row 1: Name */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            שם התרגיל <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder='לדוגמה: "הרמת רגל עם משקל"'
            className={inputClass(errors.name)}
            maxLength={60}
          />
          {errors.name && (
            <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{errors.name}
            </p>
          )}
        </div>

        {/* Row 2: Muscle Group + Body Area */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">קבוצת שרירים</label>
            <select
              value={form.muscleGroup}
              onChange={(e) => set('muscleGroup', e.target.value)}
              className={inputClass() + ' appearance-none cursor-pointer'}
              style={{ background: 'white' }}
            >
              {MUSCLE_GROUPS_SELECT.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">אזור גוף</label>
            <select
              value={form.targetArea}
              onChange={(e) => set('targetArea', e.target.value as BodyArea)}
              className={inputClass() + ' appearance-none cursor-pointer'}
              style={{ background: 'white' }}
            >
              {ALL_BODY_AREAS.map(([area, label]) => (
                <option key={area} value={area}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Sets + Mode */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              מספר סטים
              {errors.sets && <span className="text-red-400 text-[10px] mr-1">{errors.sets}</span>}
            </label>
            <input
              type="number" min={1} max={20} value={form.sets}
              onChange={(e) => set('sets', Math.max(1, parseInt(e.target.value) || 1))}
              className={inputClass(errors.sets) + ' text-center font-bold'}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">סוג תרגיל</label>
            <div className="flex rounded-xl overflow-hidden border border-slate-200 h-[38px]">
              <button type="button" onClick={() => set('mode', 'reps')}
                className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold transition-all"
                style={form.mode === 'reps'
                  ? { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }
                  : { background: 'white', color: '#64748b' }}>
                <RotateCcw className="w-3 h-3" /> חזרות
              </button>
              <button type="button" onClick={() => set('mode', 'time')}
                className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold transition-all"
                style={form.mode === 'time'
                  ? { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }
                  : { background: 'white', color: '#64748b' }}>
                <Clock className="w-3 h-3" /> זמן
              </button>
            </div>
          </div>
        </div>

        {/* Row 3b: Reps count OR Minutes:Seconds */}
        {form.mode === 'reps' ? (
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              מספר חזרות לסט
              {errors.reps && <span className="text-red-400 text-[10px] mr-1">{errors.reps}</span>}
            </label>
            <input
              type="number" min={1} max={100} value={form.reps}
              onChange={(e) => set('reps', Math.max(1, parseInt(e.target.value) || 1))}
              className={inputClass(errors.reps) + ' text-center font-bold text-lg'}
            />
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block flex items-center gap-1">
              <Clock className="w-3 h-3" />
              משך זמן לסט
              {errors.time && <span className="text-red-400 text-[10px] mr-1">{errors.time}</span>}
            </label>
            {/* Minutes : Seconds split picker */}
            <div
              className="flex items-center gap-2 p-3 rounded-xl border"
              style={{ borderColor: errors.time ? '#f87171' : '#e2e8f0', background: 'white' }}
            >
              {/* Minutes field */}
              <div className="flex-1 flex flex-col items-center">
                <label className="text-[10px] text-slate-400 mb-1">דקות</label>
                <input
                  type="number" min={0} max={60} value={form.minutes}
                  onChange={(e) => set('minutes', Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full text-center text-xl font-black border-0 focus:outline-none bg-transparent text-slate-800"
                />
              </div>

              {/* Colon separator */}
              <div className="flex flex-col items-center pb-1">
                <span className="text-2xl font-black text-teal-500 leading-none mt-4">:</span>
              </div>

              {/* Seconds field */}
              <div className="flex-1 flex flex-col items-center">
                <label className="text-[10px] text-slate-400 mb-1">שניות</label>
                <input
                  type="number" min={0} max={59} value={form.seconds}
                  onChange={(e) => set('seconds', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full text-center text-xl font-black border-0 focus:outline-none bg-transparent text-slate-800"
                />
              </div>

              {/* Live preview */}
              <div
                className="shrink-0 px-3 py-2 rounded-xl text-center"
                style={{ background: '#f0fffe', minWidth: '56px' }}
              >
                <p className="text-[9px] text-teal-600 font-medium mb-0.5">סה"כ</p>
                <p className="text-sm font-black text-teal-800">{formatTime(totalSeconds)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Row 4: Difficulty */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1.5 block">רמת קושי</label>
          <div className="flex gap-1.5">
            {([1, 2, 3, 4, 5] as ExerciseDifficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => set('difficulty', d)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                style={form.difficulty === d
                  ? { background: difficultyColor[d], color: 'white', borderColor: difficultyColor[d] }
                  : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }}
              >
                {difficultyLabel[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Row 5: Instructions */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            הוראות / הערות קליניות
          </label>
          <textarea
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder="תאר כיצד לבצע את התרגיל, הערות בטיחות, נקודות דגש..."
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 resize-none transition-all"
            style={{ background: 'white' }}
            maxLength={400}
          />
          <p className="text-[10px] text-slate-400 text-left mt-0.5">
            {form.instructions.length}/400
          </p>
        </div>

      </div>{/* end space-y-3 */}
      </div>{/* end scrollable fields */}

      {/* ── Sticky submit footer – ALWAYS VISIBLE ─────────── */}
      <div
        className="shrink-0 px-4 py-3 border-t flex gap-2"
        style={{
          borderColor: '#c7f0eb',
          background: 'linear-gradient(135deg,#e8f9f7,#f0fffe)',
        }}
      >
        {/* Primary: Add to Plan */}
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg active:scale-95"
          style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}
        >
          <Plus className="w-4 h-4" />
          הוסף לתוכנית
        </button>

        {/* Secondary: Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-3 rounded-xl text-sm font-medium text-slate-500 border border-slate-200 hover:bg-slate-100 transition-all"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

// ── Inline editor for a current-plan exercise ─────────────────────
function PlanExerciseRow({
  exercise,
  onRemove,
  onUpdate,
}: {
  exercise: PatientExercise;
  onRemove: () => void;
  onUpdate: (updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets'>>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editSets, setEditSets] = useState(exercise.patientSets);
  const [editReps, setEditReps] = useState(exercise.patientReps);

  const saveEdit = () => {
    onUpdate({ patientSets: editSets, patientReps: editReps });
    setEditing(false);
  };

  const isTimeBased = exercise.patientReps === 0 && !!exercise.holdSeconds;
  const effectiveType = exercise.isCustom ? 'custom' : exercise.type;

  return (
    <div
      className="rounded-xl border transition-all duration-200"
      style={{
        borderColor: editing ? '#0d9488' : exercise.isCustom ? '#fdba74' : '#e0f2f1',
        background: editing ? '#f0fffe' : exercise.isCustom ? '#fffbf5' : 'white',
        boxShadow: editing ? '0 0 0 2px rgba(13,148,136,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      dir="rtl"
    >
      <div className="flex items-center gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{exercise.name}</span>
            {/* Type / Custom badge */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: typeBg[effectiveType], color: typeText[effectiveType] }}
            >
              {exercise.isCustom ? (
                <span className="flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  מותאם
                </span>
              ) : typeLabel[exercise.type]}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-teal-600 font-medium truncate">{exercise.muscleGroup}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{bodyAreaLabels[exercise.targetArea]}</span>
          </div>
        </div>

        {/* Sets × Reps/Time */}
        {!editing && (
          <div className="shrink-0 text-center">
            <div className="text-sm font-bold text-slate-800">
              {exercise.patientSets} × {isTimeBased
                ? formatTime(exercise.holdSeconds!)
                : exercise.patientReps}
            </div>
            <div className="text-[10px] text-slate-400">
              {isTimeBased ? 'סטים × זמן' : 'סטים × חז\''}
            </div>
          </div>
        )}

        {/* Edit inputs */}
        {editing && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col items-center">
              <label className="text-[9px] text-slate-400 mb-0.5">סטים</label>
              <input type="number" min={1} max={10} value={editSets}
                onChange={(e) => setEditSets(Math.max(1, +e.target.value))}
                className="w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none"
                style={{ borderColor: '#0d9488' }} />
            </div>
            {!isTimeBased && (
              <>
                <span className="text-slate-400 text-sm">×</span>
                <div className="flex flex-col items-center">
                  <label className="text-[9px] text-slate-400 mb-0.5">חזרות</label>
                  <input type="number" min={1} max={100} value={editReps}
                    onChange={(e) => setEditReps(Math.max(1, +e.target.value))}
                    className="w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none"
                    style={{ borderColor: '#0d9488' }} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <button onClick={saveEdit}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50 hover:bg-teal-100 transition-colors">
                <Check className="w-4 h-4 text-teal-600" />
              </button>
              <button onClick={() => { setEditing(false); setEditSets(exercise.patientSets); setEditReps(exercise.patientReps); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-50 transition-colors">
                <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-teal-600" />
              </button>
              <button onClick={onRemove}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Library card ──────────────────────────────────────────────────
function LibraryCard({
  exercise,
  isAdded,
  onAdd,
}: {
  exercise: (typeof EXERCISE_LIBRARY)[0];
  isAdded: boolean;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border transition-all"
      style={{ borderColor: isAdded ? '#6ee7b7' : '#e2e8f0', background: isAdded ? '#f0fdf9' : 'white' }}
      dir="rtl">
      <div className="flex items-center gap-2.5 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{exercise.name}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: typeBg[exercise.type], color: typeText[exercise.type] }}>
              {typeLabel[exercise.type]}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-teal-600">{exercise.muscleGroup}</span>
            <span className="text-[10px]" style={{ color: difficultyColor[exercise.difficulty] }}>
              ● {difficultyLabel[exercise.difficulty]}
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              {exercise.holdSeconds && !exercise.reps
                ? <><Clock className="w-2.5 h-2.5" />{exercise.sets}×{exercise.holdSeconds}שנ'</>
                : <><RotateCcw className="w-2.5 h-2.5" />{exercise.sets}×{exercise.reps}</>
              }
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400 transition-colors">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onAdd} disabled={isAdded}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={isAdded
              ? { background: '#dcfce7', color: '#16a34a' }
              : { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }}>
            {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {isAdded ? 'נוסף' : 'הוסף'}
          </button>
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t text-xs text-slate-600 leading-relaxed"
          style={{ borderColor: '#e2e8f0', background: '#f8fffe' }}>
          {exercise.instructions}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────
export default function ManagePlanModal({ onClose }: ManagePlanModalProps) {
  const {
    selectedPatient, getExercisePlan,
    addExerciseToPlan, removeExerciseFromPlan, updateExerciseInPlan,
  } = usePatient();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('הכל');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!selectedPatient) return null;
  const plan = getExercisePlan(selectedPatient.id);
  const currentExercises = plan?.exercises ?? [];

  const currentIds = useMemo(() =>
    new Set(currentExercises.map((e) =>
      e.id.replace(`${selectedPatient.id}-`, '').replace(/-\d+$/, '')
    )),
    [currentExercises, selectedPatient.id]
  );

  const filteredLibrary = useMemo(() =>
    EXERCISE_LIBRARY.filter((ex) => {
      const matchGroup = activeGroup === 'הכל' || ex.muscleGroup === activeGroup;
      const matchSearch = !searchQuery ||
        ex.name.includes(searchQuery) || ex.muscleGroup.includes(searchQuery);
      return matchGroup && matchSearch;
    }),
    [activeGroup, searchQuery]
  );

  const isAddedToLibrary = (libId: string) =>
    currentIds.has(libId) || currentExercises.some((e) => e.id.includes(libId));

  const handleAddCustom = (data: CustomFormData) => {
    const xpReward = data.difficulty * 8 + 12;
    const computedHoldSeconds =
      data.mode === 'time' ? data.minutes * 60 + data.seconds : undefined;

    addExerciseToPlan(selectedPatient.id, {
      id: `custom-${Date.now()}`,
      name: data.name.trim(),
      muscleGroup: data.muscleGroup,
      targetArea: data.targetArea,
      sets: data.sets,
      reps: data.mode === 'reps' ? data.reps : undefined,
      holdSeconds: computedHoldSeconds,
      difficulty: data.difficulty,
      type: 'standard',
      instructions: data.instructions.trim(),
      xpReward,
      isCustom: true,
      videoPlaceholder: `${data.name} – הדגמה`,
      videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL,
    });

    setShowCustomForm(false);
    setSuccessMsg(`התרגיל נוסף בהצלחה: ${data.name.trim()}`);
    // Auto-close modal after 1.4 s so user sees the toast then the updated exercise list
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 1400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.52)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col"
        style={{ maxWidth: '940px', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ background: 'linear-gradient(135deg,#f0fffe,#e8f5f0)', borderColor: '#e0f2f1' }}
        >
          <div>
            <h2 className="text-lg font-bold text-slate-800">ניהול תוכנית תרגול</h2>
            <p className="text-sm text-teal-600 mt-0.5">{selectedPatient.name} — {selectedPatient.diagnosis}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-red-50 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: Current plan ──────────────────────────────────── */}
          <div className="flex flex-col border-l overflow-hidden"
            style={{ width: '44%', borderColor: '#e0f2f1' }}>

            {/* Section header with Add Custom button */}
            <div className="px-4 py-3 border-b shrink-0"
              style={{ background: '#f8fffe', borderColor: '#e0f2f1' }}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-teal-600" />
                  <span className="text-sm font-semibold text-slate-700">תרגילים בתוכנית</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: '#ccfbf1', color: '#0d9488' }}>
                    {currentExercises.length}
                  </span>
                </div>
              </div>
              {/* Add Custom Exercise button */}
              <button
                onClick={() => setShowCustomForm((v) => !v)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border-2"
                style={showCustomForm
                  ? { background: '#f0fffe', borderColor: '#0d9488', color: '#0d9488' }
                  : { background: 'linear-gradient(135deg,#0d9488,#10b981)', borderColor: 'transparent', color: 'white' }
                }
              >
                {showCustomForm
                  ? <><ChevronUp className="w-4 h-4" /> סגור טופס</>
                  : <><Wand2 className="w-4 h-4" /> הוסף תרגיל מותאם</>
                }
              </button>
            </div>

            {/* Success notification – full-width, prominent */}
            {successMsg && (
              <div
                className="mx-3 mt-2 px-4 py-3 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-md"
                style={{
                  background: 'linear-gradient(135deg,#d1fae5,#ccfbf1)',
                  color: '#065f46',
                  border: '2px solid #6ee7b7',
                }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: '#059669' }}>
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="flex-1">{successMsg}</span>
                <span className="text-xs font-normal opacity-60">הרשימה מתעדכנת...</span>
              </div>
            )}

            {/* Custom form (collapsible) */}
            {showCustomForm && (
              <CustomExerciseForm
                onAdd={handleAddCustom}
                onCancel={() => setShowCustomForm(false)}
              />
            )}

            {/* Exercise list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {currentExercises.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 gap-2 py-10">
                  <ClipboardList className="w-10 h-10 opacity-30" />
                  <p className="text-sm">התוכנית ריקה</p>
                  <p className="text-xs">הוסף תרגילים מהספרייה או צור תרגיל מותאם</p>
                </div>
              ) : (
                currentExercises.map((ex) => (
                  <PlanExerciseRow
                    key={ex.id}
                    exercise={ex}
                    onRemove={() => removeExerciseFromPlan(selectedPatient.id, ex.id)}
                    onUpdate={(updates) => updateExerciseInPlan(selectedPatient.id, ex.id, updates)}
                  />
                ))
              )}
            </div>

            {/* Total XP footer */}
            {currentExercises.length > 0 && (
              <div className="px-4 py-2 border-t shrink-0 flex items-center justify-between"
                style={{ background: '#f8fffe', borderColor: '#e0f2f1' }}>
                <span className="text-xs text-slate-500">
                  סה"כ XP פוטנציאלי:{' '}
                  <strong className="text-teal-700">
                    {currentExercises.reduce((s, e) => s + e.xpReward, 0)} XP
                  </strong>
                </span>
                <span className="text-xs text-slate-400">
                  {currentExercises.filter((e) => e.isCustom).length > 0 &&
                    `${currentExercises.filter((e) => e.isCustom).length} מותאמים`}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT: Library ─────────────────────────────────────── */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b shrink-0"
              style={{ background: '#f8fffe', borderColor: '#e0f2f1' }}>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-semibold text-slate-700">ספריית תרגילים</span>
                <span className="text-xs text-slate-400">({filteredLibrary.length})</span>
              </div>
              <div className="relative mb-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="חיפוש תרגיל..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400"
                  style={{ background: 'white' }}
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-slate-400 mt-1 shrink-0" />
                {MUSCLE_GROUPS_FILTER.map((g) => (
                  <button key={g} onClick={() => setActiveGroup(g)}
                    className="text-xs px-2.5 py-1 rounded-full font-medium transition-all"
                    style={activeGroup === g
                      ? { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }
                      : { background: '#f0fffe', color: '#0d9488', border: '1px solid #99f6e4' }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredLibrary.length === 0
                ? <div className="text-center text-slate-400 py-8 text-sm">לא נמצאו תרגילים</div>
                : filteredLibrary.map((ex) => (
                    <LibraryCard key={ex.id} exercise={ex}
                      isAdded={isAddedToLibrary(ex.id)}
                      onAdd={() => addExerciseToPlan(selectedPatient.id, ex)} />
                  ))
              }
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between"
          style={{ background: '#f8fffe', borderColor: '#e0f2f1' }}>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>שינויים נשמרים אוטומטית</span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orange-400" />
              תרגילים מותאמים מסומנים בכתום
            </span>
          </div>
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
