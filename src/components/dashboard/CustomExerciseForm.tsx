import { useState } from 'react';
import { Plus, Wand2, AlertCircle, Clock, RotateCcw } from 'lucide-react';
import type { BodyArea, ExerciseDifficulty } from '../../types';
import { PortalMultiSelect } from '../ui/PortalDropdown';
import ExerciseVideoUrlField from './ExerciseVideoUrlField';
import { formatTime } from '../../utils/formatExerciseTime';
import {
  ALL_BODY_AREAS,
  MUSCLE_GROUPS_SELECT,
  difficultyColor,
  difficultyLabel,
} from './planBuilderShared';

export interface CustomFormData {
  name: string;
  muscleGroups: string[];
  targetAreas: BodyArea[];
  sets: number;
  mode: 'reps' | 'time';
  reps: number;
  minutes: number;
  seconds: number;
  difficulty: ExerciseDifficulty;
  instructions: string;
  /** תרגיל נוסף (לבחירה) — לא חובה לסשן */
  isOptional: boolean;
  /** Optional demo video — blank by default for custom exercises */
  videoUrl: string;
}

const DEFAULT_FORM: CustomFormData = {
  name: '',
  muscleGroups: ['גב תחתון'],
  targetAreas: ['back_lower'],
  sets: 3,
  mode: 'reps',
  reps: 10,
  minutes: 0,
  seconds: 30,
  difficulty: 2,
  instructions: '',
  isOptional: false,
  videoUrl: '',
};

export default function CustomExerciseForm({
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

  /** SAFEGUARD 1: clearing video when the exercise name changes prevents mismatched clips. */
  const setName = (name: string) => {
    setForm((prev) => {
      if (prev.name !== name && prev.videoUrl.trim()) {
        return { ...prev, name, videoUrl: '' };
      }
      return { ...prev, name };
    });
  };

  const totalSeconds = form.minutes * 60 + form.seconds;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'נא להזין שם תרגיל';
    if (form.muscleGroups.length === 0) e.muscleGroups = 'נא לבחור לפחות קבוצת שרירים אחת';
    if (form.targetAreas.length === 0) e.targetAreas = 'נא לבחור לפחות אזור גוף אחד';
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
      className="mb-3 rounded-2xl border-2 flex flex-col"
      style={{
        borderColor: '#0d9488',
        background: 'linear-gradient(135deg,#f0fffe,#f8fffb)',
      }}
      dir="rtl"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}
          >
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">תרגיל מותאם אישית</p>
            <p className="text-[10px] text-slate-400">יתווסף לתוכנית עם תג &quot;מותאם&quot;</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              שם התרגיל <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setName(e.target.value)}
              placeholder='לדוגמה: "הרמת רגל עם משקל"'
              className={inputClass(errors.name)}
              maxLength={60}
            />
            {errors.name && (
              <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </p>
            )}
          </div>

          <ExerciseVideoUrlField
            id="custom-exercise-video-url"
            value={form.videoUrl}
            onChange={(url) => set('videoUrl', url)}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                קבוצת שרירים <span className="text-red-500">*</span>
              </label>
              <PortalMultiSelect
                values={form.muscleGroups}
                onChange={(v) => set('muscleGroups', v)}
                options={MUSCLE_GROUPS_SELECT.map((g) => ({ value: g, label: g }))}
                placeholder="בחר קבוצות שרירים..."
                className={inputClass(errors.muscleGroups) + ' cursor-pointer min-h-[38px]'}
                aria-label="קבוצת שרירים"
              />
              {errors.muscleGroups && (
                <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.muscleGroups}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                אזור גוף <span className="text-red-500">*</span>
              </label>
              <PortalMultiSelect
                values={form.targetAreas}
                onChange={(v) => set('targetAreas', v as BodyArea[])}
                options={ALL_BODY_AREAS.map(([area, label]) => ({ value: area, label }))}
                placeholder="בחר אזורי גוף..."
                className={inputClass(errors.targetAreas) + ' cursor-pointer min-h-[38px]'}
                aria-label="אזור גוף"
              />
              {errors.targetAreas && (
                <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.targetAreas}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                מספר סטים
                {errors.sets && <span className="text-red-400 text-[10px] mr-1">{errors.sets}</span>}
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.sets}
                onChange={(e) => set('sets', Math.max(1, parseInt(e.target.value) || 1))}
                className={inputClass(errors.sets) + ' text-center font-bold'}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">סוג תרגיל</label>
              <div className="flex rounded-xl overflow-hidden border border-slate-200 h-[38px]">
                <button
                  type="button"
                  onClick={() => set('mode', 'reps')}
                  className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold transition-all"
                  style={
                    form.mode === 'reps'
                      ? { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }
                      : { background: 'white', color: '#64748b' }
                  }
                >
                  <RotateCcw className="w-3 h-3" /> חזרות
                </button>
                <button
                  type="button"
                  onClick={() => set('mode', 'time')}
                  className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold transition-all"
                  style={
                    form.mode === 'time'
                      ? { background: 'linear-gradient(135deg,#0d9488,#10b981)', color: 'white' }
                      : { background: 'white', color: '#64748b' }
                  }
                >
                  <Clock className="w-3 h-3" /> זמן
                </button>
              </div>
            </div>
          </div>

          {form.mode === 'reps' ? (
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                מספר חזרות לסט
                {errors.reps && <span className="text-red-400 text-[10px] mr-1">{errors.reps}</span>}
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.reps}
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
              <div
                className="flex items-center gap-2 p-3 rounded-xl border"
                style={{ borderColor: errors.time ? '#f87171' : '#e2e8f0', background: 'white' }}
              >
                <div className="flex-1 flex flex-col items-center">
                  <label className="text-[10px] text-slate-400 mb-1">דקות</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={form.minutes}
                    onChange={(e) =>
                      set('minutes', Math.min(60, Math.max(0, parseInt(e.target.value) || 0)))
                    }
                    className="w-full text-center text-xl font-black border-0 focus:outline-none bg-transparent text-slate-800"
                  />
                </div>
                <div className="flex flex-col items-center pb-1">
                  <span className="text-2xl font-black text-teal-500 leading-none mt-4">:</span>
                </div>
                <div className="flex-1 flex flex-col items-center">
                  <label className="text-[10px] text-slate-400 mb-1">שניות</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={form.seconds}
                    onChange={(e) =>
                      set('seconds', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))
                    }
                    className="w-full text-center text-xl font-black border-0 focus:outline-none bg-transparent text-slate-800"
                  />
                </div>
                <div
                  className="shrink-0 px-3 py-2 rounded-xl text-center"
                  style={{ background: '#f0fffe', minWidth: '56px' }}
                >
                  <p className="text-[9px] text-teal-600 font-medium mb-0.5">סה&quot;כ</p>
                  <p className="text-sm font-black text-teal-800">{formatTime(totalSeconds)}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">רמת קושי</label>
            <div className="flex gap-1.5">
              {([1, 2, 3, 4, 5] as ExerciseDifficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('difficulty', d)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                  style={
                    form.difficulty === d
                      ? {
                          background: difficultyColor[d],
                          color: 'white',
                          borderColor: difficultyColor[d],
                        }
                      : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }
                  }
                >
                  {difficultyLabel[d]}
                </button>
              ))}
            </div>
          </div>

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

          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.isOptional}
              onChange={(e) => set('isOptional', e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-600"
            />
            <span className="text-xs text-slate-700 leading-snug">
              <span className="font-bold text-slate-800">תרגיל נוסף (לבחירה)</span>
              <span className="block text-slate-500 mt-0.5">
                לא חובה לסיום הסשן — מעניק מטבעות בונוס ואנרגיה לזוהר, בלי XP לרמה
              </span>
            </span>
          </label>
        </div>
      </div>

      <div
        className="shrink-0 px-4 py-3 border-t flex gap-2"
        style={{
          borderColor: '#c7f0eb',
          background: 'linear-gradient(135deg,#e8f9f7,#f0fffe)',
        }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg active:scale-95"
          style={{ background: 'linear-gradient(135deg,#0d9488,#10b981)' }}
        >
          <Plus className="w-4 h-4" />
          הוסף לתוכנית
        </button>
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
