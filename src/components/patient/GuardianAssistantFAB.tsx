import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send } from 'lucide-react';
import type { Patient } from '../../types';
import { buildGuardianReply } from './buildGuardianReply';

interface GuardianAssistantFABProps {
  patient: Patient;
  exerciseCount: number;
  /** מוסתר כשמודל אחר פתוח (תרגיל / דיווח) */
  hidden?: boolean;
}

export default function GuardianAssistantFAB({
  patient,
  exerciseCount,
  hidden,
}: GuardianAssistantFABProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  if (hidden) return null;

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const reply = buildGuardianReply(text, patient, exerciseCount);
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: reply }]);
    setInput('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-[65] bottom-6 left-4 flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg text-white"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          boxShadow: '0 12px 28px -8px rgba(79, 70, 229, 0.55)',
        }}
        aria-label="עוזר Guardian"
      >
        <Bot className="w-7 h-7" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(49, 46, 129, 0.25)' }}
          dir="rtl"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[min(85vh,560px)]"
            style={{
              background: 'linear-gradient(180deg, #eef2ff 0%, #ffffff 45%)',
              borderColor: '#c7d2fe',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guardian-title"
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: '#e0e7ff' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#e0e7ff' }}
                >
                  <Bot className="w-5 h-5 text-indigo-700" />
                </div>
                <div className="min-w-0">
                  <h2 id="guardian-title" className="text-sm font-bold text-indigo-950 truncate">
                    עוזר Guardian
                  </h2>
                  <p className="text-[11px] text-indigo-600/90">שאלות על כאב ותרגילים לפי המצב שלך</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl text-indigo-600 hover:bg-indigo-100/80 shrink-0"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[180px]">
              {messages.length === 0 && (
                <p className="text-xs text-slate-500 leading-relaxed px-1">
                  לדוגמה: «אם אני מרגיש כאב 6, מה לעשות?» או «כמה תרגילים יש לי היום?»
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className="max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                    style={
                      msg.role === 'user'
                        ? { background: '#e0e7ff', color: '#1e1b4b' }
                        : { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' }
                    }
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="p-3 border-t shrink-0 flex gap-2" style={{ borderColor: '#e0e7ff' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="שאלה על כאב או תרגילים…"
                className="flex-1 min-w-0 rounded-2xl border border-indigo-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                style={{ background: '#fafafa' }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim()}
                className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
                aria-label="שלח"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
