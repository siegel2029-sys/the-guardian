import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Dumbbell,
  Loader2,
  Plus,
  Search,
  Pencil,
  Power,
  X,
} from 'lucide-react';
import { useExerciseCatalog } from '../../hooks/useExerciseCatalog';
import type { BodyArea, ExerciseDifficulty, ExerciseType } from '../../types';
import { bodyAreaLabels } from '../../types';
import type { ExerciseCatalogRow } from '../../services/exerciseCatalogService';
import ExerciseVideoUrlField from './ExerciseVideoUrlField';
import { isSupabaseConfigured } from '../../lib/supabase';

const BODY_AREAS = Object.keys(bodyAreaLabels) as BodyArea[];

type EditorState = {
  id?: string;
  name: string;
  muscleGroup: string;
  targetArea: BodyArea;
  sets: number;
  reps: string;
  holdSeconds: string;
  difficulty: ExerciseDifficulty;
  type: ExerciseType;
  instructions: string;
  defaultVideoUrl: string;
  isActive: boolean;
};

function emptyEditor(): EditorState {
  return {
    name: '',
    muscleGroup: '',
    targetArea: 'back_lower',
    sets: 3,
    reps: '10',
    holdSeconds: '',
    difficulty: 2,
    type: 'clinical',
    instructions: '',
    defaultVideoUrl: '',
    isActive: true,
  };
}

function rowToEditor(row: ExerciseCatalogRow): EditorState {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    targetArea: row.target_area as BodyArea,
    sets: row.sets,
    reps: row.reps != null ? String(row.reps) : '',
    holdSeconds: row.hold_seconds != null ? String(row.hold_seconds) : '',
    difficulty: Math.min(5, Math.max(1, row.difficulty)) as ExerciseDifficulty,
    type: row.type === 'standard' ? 'standard' : 'clinical',
    instructions: row.instructions ?? '',
    defaultVideoUrl: row.default_video_url ?? '',
    isActive: row.is_active,
  };
}

export default function ManageExerciseCatalogPanel() {
  const { rows, loading, error, create, update, setActive, refresh } =
    useExerciseCatalog({ includeInactive: true });
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.is_active) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.muscle_group.toLowerCase().includes(q) ||
        r.target_area.toLowerCase().includes(q)
      );
    });
  }, [rows, query, showInactive]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  const openCreate = () => {
    setFormError(null);
    setStatusMsg(null);
    setEditor(emptyEditor());
  };

  const openEdit = (row: ExerciseCatalogRow) => {
    setFormError(null);
    setStatusMsg(null);
    setEditor(rowToEditor(row));
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setFormError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    setFormError(null);
    setStatusMsg(null);
    const name = editor.name.trim();
    const muscleGroup = editor.muscleGroup.trim();
    const instructions = editor.instructions.trim();
    if (!name) {
      setFormError('נא למלא שם תרגיל.');
      return;
    }
    if (!muscleGroup) {
      setFormError('נא למלא קבוצת שריר.');
      return;
    }
    if (!instructions) {
      setFormError('נא למלא הוראות ביצוע.');
      return;
    }
    const repsRaw = editor.reps.trim();
    const holdRaw = editor.holdSeconds.trim();
    const reps = repsRaw === '' ? null : Number(repsRaw);
    const holdSeconds = holdRaw === '' ? null : Number(holdRaw);
    if (reps != null && (!Number.isFinite(reps) || reps < 0)) {
      setFormError('מספר חזרות לא תקין.');
      return;
    }
    if (holdSeconds != null && (!Number.isFinite(holdSeconds) || holdSeconds < 0)) {
      setFormError('זמן החזקה לא תקין.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        muscleGroup,
        targetArea: editor.targetArea,
        sets: editor.sets,
        reps,
        holdSeconds,
        difficulty: editor.difficulty,
        type: editor.type,
        instructions,
        defaultVideoUrl: editor.defaultVideoUrl.trim(),
        isActive: editor.isActive,
      };
      if (editor.id) {
        await update(editor.id, payload);
        setStatusMsg('התרגיל עודכן בקטלוג. תוכניות קיימות לא השתנו.');
      } else {
        await create(payload);
        setStatusMsg('תרגיל חדש נוסף לקטלוג.');
      }
      setEditor(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ExerciseCatalogRow) => {
    setStatusMsg(null);
    try {
      await setActive(row.id, !row.is_active);
      setStatusMsg(
        row.is_active
          ? 'התרגיל הושבת (לא יופיע בבחירה מתוך הספרייה).'
          : 'התרגיל הופעל מחדש.'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'עדכון סטטוס נכשל');
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col" dir="rtl">
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-teal-600" aria-hidden />
              קטלוג תרגילים
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              ניהול ספריית התרגילים הגלובלית. עדכון קישור וידאו כאן ימולא אוטומטית
              בתרגילים חדשים שיתווספו לתוכנית מטופל — לא ישכתב תוכניות קיימות.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            disabled={!isSupabaseConfigured}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden />
            תרגיל חדש
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם, מזהה או אזור…"
              className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400"
              aria-label="חיפוש בקטלוג"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300"
            />
            הצג מושבתים
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-sm text-teal-700 font-medium hover:underline"
          >
            רענון
          </button>
          <span className="text-xs text-slate-400">
            {filtered.length} / {rows.length}
          </span>
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {statusMsg && (
          <p className="mt-2 text-sm text-teal-700" role="status">
            {statusMsg}
          </p>
        )}
        {!isSupabaseConfigured && (
          <p className="mt-2 text-sm text-amber-700">
            Supabase לא מוגדר — לא ניתן לנהל את הקטלוג במצב זה.
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            טוען קטלוג…
          </div>
        ) : (
          <div ref={parentRef} className="h-full overflow-auto px-4 sm:px-6 py-3">
            <div
              style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = filtered[virtualRow.index];
                return (
                  <div
                    key={row.id}
                    className="absolute inset-x-0 px-0"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className={`h-[68px] flex items-center gap-3 px-3 rounded-xl border ${
                        row.is_active
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 truncate">
                            {row.name}
                          </p>
                          {!row.is_active && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                              מושבת
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {row.id} · {row.muscle_group} ·{' '}
                          {bodyAreaLabels[row.target_area as BodyArea] ??
                            row.target_area}
                          {row.default_video_url
                            ? ' · יש וידאו'
                            : ' · ללא וידאו'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-teal-700 border border-teal-200 hover:bg-teal-50"
                        aria-label={`ערוך ${row.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                        עריכה
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(row)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100"
                        aria-label={
                          row.is_active ? `השבת ${row.name}` : `הפעל ${row.name}`
                        }
                      >
                        <Power className="w-3.5 h-3.5" aria-hidden />
                        {row.is_active ? 'השבת' : 'הפעל'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-10">
                לא נמצאו תרגילים התואמים לחיפוש.
              </p>
            )}
          </div>
        )}
      </div>

      {editor && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={closeEditor}
          role="presentation"
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-editor-title"
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <h2 id="catalog-editor-title" className="font-bold text-slate-900">
                {editor.id ? 'עריכת תרגיל בקטלוג' : 'תרגיל חדש בקטלוג'}
              </h2>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="סגור"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
            <form onSubmit={(e) => void submit(e)} className="p-4 space-y-3">
              {editor.id && (
                <p className="text-xs text-slate-400 font-mono" dir="ltr">
                  {editor.id}
                </p>
              )}
              <div>
                <label htmlFor="cat-name" className="text-xs font-medium text-slate-600 mb-1 block">
                  שם
                </label>
                <input
                  id="cat-name"
                  value={editor.name}
                  onChange={(e) =>
                    setEditor((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cat-muscle" className="text-xs font-medium text-slate-600 mb-1 block">
                    קבוצת שריר
                  </label>
                  <input
                    id="cat-muscle"
                    value={editor.muscleGroup}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev ? { ...prev, muscleGroup: e.target.value } : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="cat-area" className="text-xs font-medium text-slate-600 mb-1 block">
                    אזור גוף
                  </label>
                  <select
                    id="cat-area"
                    value={editor.targetArea}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev
                          ? { ...prev, targetArea: e.target.value as BodyArea }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400"
                  >
                    {BODY_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {bodyAreaLabels[a]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label htmlFor="cat-sets" className="text-xs font-medium text-slate-600 mb-1 block">
                    סטים
                  </label>
                  <input
                    id="cat-sets"
                    type="number"
                    min={1}
                    value={editor.sets}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev
                          ? { ...prev, sets: Math.max(1, Number(e.target.value) || 1) }
                          : prev
                      )
                    }
                    className="w-full px-2 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="cat-reps" className="text-xs font-medium text-slate-600 mb-1 block">
                    חזרות
                  </label>
                  <input
                    id="cat-reps"
                    type="number"
                    min={0}
                    value={editor.reps}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev ? { ...prev, reps: e.target.value } : prev
                      )
                    }
                    className="w-full px-2 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="cat-hold" className="text-xs font-medium text-slate-600 mb-1 block">
                    החזקה (ש׳)
                  </label>
                  <input
                    id="cat-hold"
                    type="number"
                    min={0}
                    value={editor.holdSeconds}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev ? { ...prev, holdSeconds: e.target.value } : prev
                      )
                    }
                    className="w-full px-2 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="cat-diff" className="text-xs font-medium text-slate-600 mb-1 block">
                    קושי
                  </label>
                  <select
                    id="cat-diff"
                    value={editor.difficulty}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              difficulty: Number(e.target.value) as ExerciseDifficulty,
                            }
                          : prev
                      )
                    }
                    className="w-full px-2 py-2 text-sm rounded-xl border border-slate-200"
                  >
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="cat-type" className="text-xs font-medium text-slate-600 mb-1 block">
                  סוג
                </label>
                <select
                  id="cat-type"
                  value={editor.type}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev
                        ? { ...prev, type: e.target.value as ExerciseType }
                        : prev
                    )
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                >
                  <option value="clinical">clinical</option>
                  <option value="standard">standard</option>
                </select>
              </div>
              <div>
                <label htmlFor="cat-instructions" className="text-xs font-medium text-slate-600 mb-1 block">
                  הוראות
                </label>
                <textarea
                  id="cat-instructions"
                  value={editor.instructions}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev ? { ...prev, instructions: e.target.value } : prev
                    )
                  }
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400"
                  required
                />
              </div>
              <ExerciseVideoUrlField
                id="cat-video"
                value={editor.defaultVideoUrl}
                onChange={(url) =>
                  setEditor((prev) =>
                    prev ? { ...prev, defaultVideoUrl: url } : prev
                  )
                }
              />
              {formError && (
                <p className="text-sm text-red-600" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  שמירה לקטלוג
                </button>
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
