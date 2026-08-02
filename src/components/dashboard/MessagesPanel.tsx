import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, MessageSquare, Clock, User, Bot } from 'lucide-react';
import { usePatientRoster, usePatientChat } from '../../context/patientDomainHooks';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import { devLog, redactId } from '../../lib/safeLog';
import ErrorBoundary from '../ui/error-boundary';

type MessagesPanelProps = {
  /** מוטמע בתוך כרטיס פרופיל — כותרת קומפקטית ללא אווטאר כפול */
  embedded?: boolean;
  /** בחלון מוטמע — גובה מקסימלי לאזור ההודעות (גלילה פנימית) */
  embeddedMessageMaxHeight?: number;
};

/** צ׳אט ישיר מטפל ↔ המטופל הנבחר (המטופל רואה בפורטל) */
function MessagesPanelContent({
  embedded = false,
  embeddedMessageMaxHeight = 380,
}: MessagesPanelProps) {
  const { selectedPatient, selectedPatientId } = usePatientRoster();
  const {
    getPatientMessages,
    markMessageRead,
    sendTherapistReply,
    messages: allMessages,
  } = usePatientChat();
  const [replyText, setReplyText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const threadPatientId = (selectedPatient?.id ?? selectedPatientId).trim();
  const messages = threadPatientId ? getPatientMessages(threadPatientId) : [];
  const displayName = selectedPatient
    ? getPatientDisplayName(selectedPatient)
    : threadPatientId
      ? 'מטופל נבחר'
      : '';

  const threadSignature = useMemo(
    () =>
      threadPatientId
        ? allMessages
            .filter((m) => m.patientId === threadPatientId)
            .map((m) => `${m.id}:${m.timestamp}:${m.content.length}:${m.isRead ? 1 : 0}`)
            .join('|')
        : '',
    [allMessages, threadPatientId]
  );

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [messages]
  );

  const olderMessageCount = Math.max(0, sortedMessages.length - 15);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [threadPatientId, threadSignature, sortedMessages.length]);

  useEffect(() => {
    if (!threadPatientId) return;
    const unreadIds = messages
      .filter((m) => !m.isRead && (m.fromPatient || m.aiClinicalAlert))
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => markMessageRead(id));
    }
  }, [threadPatientId, threadSignature, messages, markMessageRead]);

  const handleSend = useCallback(() => {
    const body = replyText.trim();
    if (!body || !threadPatientId) return;
    devLog('[Chat UI] MessagesPanel send', { patientRef: redactId(threadPatientId) });
    sendTherapistReply(threadPatientId, body);
    setReplyText('');
  }, [replyText, threadPatientId, sendTherapistReply]);

  const canSend = Boolean(threadPatientId && replyText.trim().length > 0);

  if (!threadPatientId) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500"
        dir="rtl"
      >
        <MessageSquare className="w-14 h-14 text-teal-200 mb-3" />
        <p className="text-sm font-medium text-slate-700">בחרו מטופל מהרשימה בצד</p>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          לאחר בחירה תופיע כאן השיחה המלאה. הודעות נשמרות במכשיר ומוצגות גם בפורטל המטופל.
        </p>
      </div>
    );
  }

  const unreadIds = messages
    .filter((m) => !m.isRead && (m.fromPatient || m.aiClinicalAlert))
    .map((m) => m.id);

  const handleMarkAllRead = () => {
    unreadIds.forEach((id) => markMessageRead(id));
  };

  return (
    <div
      className={`flex flex-col min-h-0 bg-[#f8fafc] ${
        embedded ? 'h-full max-h-full overflow-hidden' : 'h-full'
      }`}
      dir="rtl"
    >
      <div
        className={`shrink-0 border-b border-teal-100 flex flex-wrap items-center justify-between gap-3 ${
          embedded ? 'px-4 py-3' : 'px-6 py-4'
        }`}
        style={{ background: 'rgba(255,255,255,0.97)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {!embedded && (
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              {displayName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h2
              className={`font-bold text-slate-800 truncate flex items-center gap-2 ${
                embedded ? 'text-base' : 'text-lg'
              }`}
            >
              <MessageSquare className="w-5 h-5 text-teal-600 shrink-0" aria-hidden="true" />
              {embedded ? 'הודעות' : `צ׳אט עם ${displayName}`}
              {embedded && unreadIds.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-teal-600 text-white text-[10px] font-black">
                  {unreadIds.length}
                </span>
              )}
            </h2>
            {!embedded && selectedPatient?.diagnosis ? (
              <p className="text-xs text-slate-500 truncate">{selectedPatient.diagnosis}</p>
            ) : null}
          </div>
        </div>
        {unreadIds.length > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs font-semibold text-teal-700 hover:text-teal-900 px-3 py-2 rounded-xl border border-teal-200 bg-teal-50/80 transition-colors"
          >
            סמן הכל כנקרא ({unreadIds.length})
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className={`overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 min-h-0 ${
          embedded ? 'flex-1 shrink' : 'flex-1'
        }`}
        style={embedded ? { maxHeight: embeddedMessageMaxHeight } : undefined}
        aria-label="היסטוריית הודעות"
      >
        <div className="max-w-7xl mx-auto w-full space-y-3 pb-2">
          {embedded && olderMessageCount > 0 && (
            <p className="sticky top-0 z-10 text-center text-[10px] font-semibold text-slate-400 bg-[#f8fafc]/95 py-1.5 rounded-lg border border-dashed border-slate-200">
              {olderMessageCount} הודעות קודמות — גללו למעלה
            </p>
          )}
          {sortedMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-teal-200 bg-white p-10 text-center text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">אין הודעות עדיין — שלחו את ההודעה הראשונה למטופל</p>
            </div>
          ) : (
            sortedMessages.map((msg) => {
                const isFromPatient = msg.fromPatient;
                const isAiAlert = msg.aiClinicalAlert;
                const tier = msg.clinicalSafetyTier;
                const alignEnd = isFromPatient && !isAiAlert;
                const alertStyle =
                  isAiAlert && tier === 'emergency'
                    ? { background: '#fef2f2', borderColor: '#f87171' }
                    : isAiAlert && tier === 'high_priority'
                      ? { background: '#fffbeb', borderColor: '#fbbf24' }
                      : isAiAlert
                        ? { background: '#eef2ff', borderColor: '#a5b4fc' }
                        : isFromPatient
                          ? { background: '#f0fdfa', borderColor: '#a7f3d0' }
                          : { background: '#ffffff', borderColor: '#e2e8f0' };
                const botColor =
                  tier === 'emergency'
                    ? 'text-red-600'
                    : tier === 'high_priority'
                      ? 'text-amber-700'
                      : 'text-indigo-600';
                const senderLabel =
                  isAiAlert && tier === 'emergency'
                    ? 'התראת חירום'
                    : isAiAlert && tier === 'high_priority'
                      ? 'התראת בטיחות'
                      : isAiAlert
                        ? 'PHYSIOSHIELD AI'
                        : isFromPatient
                          ? displayName
                          : 'אני (מטפל)';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${alignEnd ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border"
                      style={alertStyle}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isAiAlert ? (
                          <Bot className={`w-3.5 h-3.5 ${botColor}`} />
                        ) : isFromPatient ? (
                          <User className="w-3.5 h-3.5 text-teal-500" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="text-[10px] font-semibold text-slate-500">
                          {senderLabel}
                        </span>
                        {!msg.isRead && (isFromPatient || isAiAlert) && (
                          <span className="w-2 h-2 rounded-full bg-teal-500" />
                        )}
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Clock className="w-3 h-3 text-slate-300" />
                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.timestamp).toLocaleString('he-IL', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      <div
        className={`shrink-0 border-t border-teal-100 px-4 sm:px-6 ${
          embedded ? 'py-3' : 'py-4'
        }`}
        style={{ background: 'rgba(255,255,255,0.98)' }}
      >
        <form
          className={`mx-auto space-y-2 ${embedded ? 'max-w-none' : 'max-w-5xl'}`}
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          {!embedded && (
            <p className="text-xs font-semibold text-slate-600 mb-2">הודעה חדשה למטופל</p>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="כתבו כאן… ההודעה תופיע מיד בפורטל המטופל"
              rows={embedded ? 2 : 3}
              aria-label="הודעה חדשה למטופל"
              className="flex-1 resize-none rounded-2xl border border-teal-200/90 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400/40 placeholder:text-slate-400"
              style={{ background: '#fafefd' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="submit"
              aria-disabled={!canSend}
              className={`shrink-0 h-12 px-5 rounded-2xl text-white text-sm font-bold transition-all flex items-center gap-2 shadow-lg ${
                canSend ? '' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{
                background: 'linear-gradient(135deg, #0d9488, #10b981)',
                boxShadow: '0 8px 24px -6px rgba(13, 148, 136, 0.45)',
              }}
            >
              <Send className="w-4 h-4" />
              שלח
            </button>
          </div>
          {!embedded && (
            <p className="text-[10px] text-slate-400 mt-2">Enter לשליחה · Shift+Enter לשורה חדשה</p>
          )}
        </form>
      </div>
    </div>
  );
}

/** Isolates chat render failures from the therapist dashboard shell / patient overview card. */
export default function MessagesPanel(props: MessagesPanelProps) {
  return (
    <ErrorBoundary variant="section" scopeLabel="TherapistMessagesPanel">
      <MessagesPanelContent {...props} />
    </ErrorBoundary>
  );
}
