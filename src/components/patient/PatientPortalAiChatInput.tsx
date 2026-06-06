import { memo, useCallback, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

/** מפתח קבוע — מונע איבוד פוקוס בעת רינדור מחדש של הורה */
export const PATIENT_PORTAL_AI_CHAT_INPUT_KEY = 'patient-portal-ai-chat-input';
export const PATIENT_PORTAL_AI_CHAT_PLACEHOLDER = 'יש לך שאלה על השיקום? כתוב כאן';

type Props = {
  /** נשמר לתאימות — הקלט אינו תלוי ב־patientId לרינדור */
  patientId?: string;
  onSend: (text: string) => void;
  replyLoading?: boolean;
  /** `inline` = שורה מלאה (טאב צ׳אט); `floating-fab` = כפתור עגול מתרחב בריחוף */
  variant?: 'inline' | 'floating-fab';
};

function PatientPortalAiChatInput({
  onSend,
  replyLoading = false,
  variant = 'inline',
}: Props) {
  const [messageText, setMessageText] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasDraft = messageText.trim().length > 0;
  const isFloatingFab = variant === 'floating-fab';
  const isExpanded = !isFloatingFab || isHovered || isFocused || hasDraft;

  const handleSend = useCallback(() => {
    const text = messageText.trim();
    if (!text || replyLoading) return;
    onSend(text);
    setMessageText('');
    inputRef.current?.blur();
  }, [messageText, onSend, replyLoading]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleFabActivate = useCallback(() => {
    setIsHovered(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const inputEl = (
    <input
      key={PATIENT_PORTAL_AI_CHAT_INPUT_KEY}
      ref={inputRef}
      type="text"
      value={messageText}
      onChange={(e) => setMessageText(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !replyLoading && messageText.trim()) {
          e.preventDefault();
          handleSend();
        }
      }}
      placeholder={PATIENT_PORTAL_AI_CHAT_PLACEHOLDER}
      tabIndex={isFloatingFab && !isExpanded ? -1 : 0}
      className={
        isFloatingFab
          ? 'min-w-0 w-[min(16rem,calc(100vw-7rem))] rounded-xl border border-slate-200 bg-white px-3 py-2 text-end text-[0.9375rem] font-medium text-slate-800 placeholder:text-slate-500 focus:border-indigo-200/80 focus:outline-none focus:ring-2 focus:ring-indigo-400/25'
          : 'min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-end text-[0.9375rem] font-medium text-slate-800 placeholder:text-slate-500 focus:border-indigo-200/80 focus:outline-none focus:ring-2 focus:ring-indigo-400/25'
      }
      aria-label={PATIENT_PORTAL_AI_CHAT_PLACEHOLDER}
    />
  );

  const sendButton = (
    <button
      type="button"
      onClick={handleSend}
      disabled={!messageText.trim() || replyLoading}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40"
      style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
      aria-label="שלח לעוזר השיקום"
    >
      <Send className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  if (isFloatingFab) {
    return (
      <div
        className={`group pointer-events-auto touch-manipulation flex items-center overflow-hidden rounded-full border border-slate-200/70 bg-white/95 shadow-lg backdrop-blur-md motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out ${
          isExpanded
            ? 'max-w-[min(calc(100vw-1.5rem),22rem)] ps-1 pe-2 py-1 hover:border-slate-300/90 hover:shadow-xl'
            : 'h-12 w-12 min-h-12 min-w-12 justify-center hover:border-slate-300/90 hover:bg-white active:scale-[0.99]'
        }`}
        dir="ltr"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (!isExpanded) handleFabActivate();
        }}
        onKeyDown={(e) => {
          if (isExpanded) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleFabActivate();
          }
        }}
        tabIndex={isExpanded ? -1 : 0}
        role={isExpanded ? 'group' : 'button'}
        aria-expanded={isExpanded}
        aria-label="עוזר שיקום AI"
      >
        <div
          className={`flex shrink-0 items-center justify-center ${isExpanded ? 'ms-1 me-1.5' : ''}`}
        >
          <Sparkles
            className="h-5 w-5 shrink-0 text-medical-primary"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>
        <div
          className={`flex min-w-0 flex-1 items-center gap-2 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out ${
            isExpanded
              ? 'max-w-[min(calc(100vw-5rem),20rem)] opacity-100'
              : 'pointer-events-none max-w-0 flex-none overflow-hidden opacity-0'
          }`}
          dir="rtl"
        >
          {inputEl}
          {sendButton}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative z-[1] flex items-center gap-2 rounded-xl border border-indigo-100 bg-white px-2 py-1.5 shadow-sm pointer-events-auto touch-manipulation"
      dir="rtl"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
        <Sparkles className="h-4 w-4 text-medical-primary" strokeWidth={2} aria-hidden="true" />
      </div>
      {inputEl}
      {sendButton}
    </div>
  );
}

export default memo(PatientPortalAiChatInput);
