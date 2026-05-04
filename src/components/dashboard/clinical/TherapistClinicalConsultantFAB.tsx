import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import type { Patient, SafetyAlert } from '../../../types';
import { getGeminiApiKey } from '../../../ai/geminiClient';
import { therapistClinicalConsultantChatWithGemini } from '../../../ai/geminiClinicalConsultant';

type Props = {
  patient: Patient;
  safetyAlertsForPatient: SafetyAlert[];
  exerciseSafetyLocked: boolean;
};

export default function TherapistClinicalConsultantFAB({
  patient,
  safetyAlertsForPatient,
  exerciseSafetyLocked,
}: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, loading]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (!getGeminiApiKey()) {
      setError('הבינה המלאכותית אינה זמינה: נדרש חיבור Supabase ופונקציית gemini-proxy.');
      return;
    }

    setError(null);
    setInput('');
    const history = [...messages];
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);

    try {
      const reply = await therapistClinicalConsultantChatWithGemini({
        patient,
        safetyAlertsForPatient,
        exerciseSafetyLocked,
        history,
        userMessage: text,
      });
      setMessages((m) => [...m, { role: 'assistant', text: reply.trim() || 'לא התקבלה תשובה.' }]);
    } catch (e) {
      console.warn('[TherapistClinicalConsultantFAB]', e);
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: `מצטערים — לא ניתן היה לקבל תשובה כרגע. ${msg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-[70] bottom-6 left-4 md:left-6 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-400/70 bg-white/95 text-medical-primary shadow-lg backdrop-blur-md motion-safe:transition-transform hover:bg-slate-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
        style={{ boxShadow: '0 12px 32px -10px rgba(30, 58, 95, 0.35)' }}
        aria-label="פתיחת יועץ קליני AI"
      >
        <Sparkles className="w-7 h-7 shrink-0" strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[78] pointer-events-none">
          <div
            className="absolute inset-0 bg-slate-900/25 pointer-events-auto backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            role="presentation"
            aria-hidden
          />
          <aside
            className="pointer-events-auto absolute bottom-0 left-0 md:bottom-5 md:left-5 flex w-full max-h-[min(92dvh,720px)] md:w-[min(calc(100vw-2.5rem),440px)] flex-col overflow-hidden rounded-t-3xl md:rounded-3xl border border-slate-300/90 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, #f1f5f9 0%, #f8fafc 42%, #ffffff 100%)',
              boxShadow: '0 24px 64px -12px rgba(15, 23, 42, 0.45)',
            }}
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clinical-consultant-title"
          >
            <header
              className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-300/60 bg-slate-200/40 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300/80 bg-white shadow-sm">
                  <Sparkles className="h-5 w-5 text-medical-primary shrink-0" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <h2 id="clinical-consultant-title" className="truncate text-sm font-bold text-slate-900">
                    יועץ קליני AI
                  </h2>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    ייעוץ מקצועי למטפל — ללא מזהי מטופל בבקשה ל-API
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-xl border border-transparent p-2 text-slate-600 hover:bg-slate-100/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                aria-label="סגור יועץ קליני"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {error && (
                <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {error}
                </p>
              )}
              {messages.length === 0 && !loading && (
                <p className="px-1 text-xs leading-relaxed text-slate-600">
                  התמונה הקלינית האנונימית (גיל, הקשר תעסוקתי מנוקה, כאב, דגלים אדומים) מוזנת אוטומטית
                  למודל. ניתן לשאול על דיפרנציאל, התאמת תרגול, ניטור והמשך הערכה — בעברית מקצועית.
                </p>
              )}
              <div className="mt-2 space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className="max-w-[94%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed"
                      style={
                        msg.role === 'user'
                          ? {
                              background: '#e2e8f0',
                              color: '#0f172a',
                              border: '1px solid #cbd5e1',
                            }
                          : {
                              background: '#ffffff',
                              color: '#1e293b',
                              border: '1px solid #94a3b8',
                            }
                      }
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-end">
                    <div className="flex max-w-[94%] items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" aria-hidden />
                      מנתח…
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-300/60 bg-slate-100/50 p-3">
              <label htmlFor="clinical-consultant-input" className="sr-only">
                שאלה ליועץ הקליני
              </label>
              <div className="flex gap-2 items-end">
                <textarea
                  id="clinical-consultant-input"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  readOnly={loading}
                  rows={2}
                  placeholder="נסחו שאלה קלינית בעברית…"
                  className="min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/35"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading && input.trim()) void send();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!input.trim() || loading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-600/20 text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
                  style={{ background: 'linear-gradient(145deg, #475569, #1e3a5f)' }}
                  aria-label="שליחה"
                >
                  <Send className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
