import { useState } from 'react';
import { Eye, X } from 'lucide-react';

interface ExerciseVideoUrlFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** Optional id prefix for label/input association */
  id?: string;
  className?: string;
}

/**
 * Therapist video URL editor with clear (X) and HTML5 preview modal.
 * Used when building/editing exercise plans so the wrong clip is not saved.
 */
export default function ExerciseVideoUrlField({
  value,
  onChange,
  id = 'exercise-video-url',
  className = '',
}: ExerciseVideoUrlFieldProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const trimmed = value.trim();
  const canPreview = trimmed.length > 0;

  const openPreview = () => {
    if (!canPreview) return;
    setLoadError(false);
    setPreviewOpen(true);
  };

  return (
    <div className={className} dir="rtl">
      <label htmlFor={id} className="text-xs font-medium text-slate-600 mb-1 block">
        קישור לסרטון (Supabase URL)
      </label>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <input
            id={id}
            type="url"
            dir="ltr"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://….supabase.co/storage/v1/object/public/…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 text-left"
          />
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="נקה קישור סרטון"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openPreview}
          disabled={!canPreview}
          title={canPreview ? 'תצוגה מקדימה' : 'הזן קישור כדי לצפות בתצוגה מקדימה'}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-slate-200 text-teal-700 hover:bg-teal-50 enabled:hover:border-teal-300"
        >
          <Eye className="w-3.5 h-3.5" aria-hidden />
          תצוגה מקדימה
        </button>
      </div>

      {previewOpen && canPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setPreviewOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="תצוגה מקדימה של סרטון"
            dir="rtl"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">תצוגה מקדימה</p>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="סגור תצוגה מקדימה"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
            <div className="p-4">
              {loadError ? (
                <div className="w-full aspect-video rounded-xl bg-slate-100 flex items-center justify-center px-4 text-center">
                  <p className="text-sm text-slate-600">לא ניתן לטעון את הסרטון</p>
                </div>
              ) : (
                <video
                  key={trimmed}
                  src={trimmed}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-xl shadow-md aspect-video bg-gray-100 object-contain"
                  onError={() => setLoadError(true)}
                />
              )}
              <p className="mt-2 text-[10px] text-slate-400 break-all dir-ltr text-left">{trimmed}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
