import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, MessageSquare, Clock, User, Bot } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';

/** צ׳אט ישיר מטפל ↔ המטופל הנבחר (המטופל רואה בפורטל) */
export default function MessagesPanel() {
  const { selectedPatient, getPatientMessages, markMessageRead, sendTherapistReply, messages: allMessages } =
    usePatient();
  const [replyText, setReplyText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const messages = selectedPatient ? getPatientMessages(selectedPatient.id) : [];

  const threadSignature = useMemo(
    () =>
      selectedPatient
        ? allMessages
            .filter((m) => m.patientId === selectedPatient.id)
            .map((m) => `${m.id}:${m.timestamp}:${m.content.length}:${m.isRead ? 1 : 0}`)
            .join('|')
        : '',
    [allMessages, selectedPatient?.id]
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [selectedPatient?.id, threadSignature]);

  if (!selectedPatient) {
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

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendTherapistReply(selectedPatient.id, replyText.trim());
    setReplyText('');
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#f8fafc]" dir="rtl">
      <div
        className="shrink-0 px-6 py-4 border-b border-teal-100 flex flex-wrap items-center justify-between gap-3"
        style={{ background: 'rgba(255,255,255,0.97)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {selectedPatient.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-600 shrink-0" />
              צ׳אט עם {selectedPatient.name}
            </h2>
            <p className="text-xs text-slate-500 truncate">{selectedPatient.diagnosis}</p>
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

      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 min-h-0">
        <div className="max-w-4xl mx-auto w-full space-y-3 pb-4">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-teal-200 bg-white p-10 text-center text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">אין הודעות עדיין — שלחו את ההודעה הראשונה למטופל</p>
            </div>
          ) : (
            [...messages]
              .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
              .map((msg) => {
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
                        ? 'Guardian AI'
                        : isFromPatient
                          ? selectedPatient.name
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
        className="shrink-0 border-t border-teal-100 px-4 sm:px-6 py-4"
        style={{ background: 'rgba(255,255,255,0.98)' }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-slate-600 mb-2">הודעה חדשה למטופל</p>
          <div className="flex gap-2 items-end">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="כתבו כאן… ההודעה תופיע מיד בפורטל המטופל"
              rows={3}
              className="flex-1 resize-none rounded-2xl border border-teal-200/90 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400/40 placeholder:text-slate-400"
              style={{ background: '#fafefd' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!replyText.trim()}
              className="shrink-0 h-12 px-5 rounded-2xl text-white text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #0d9488, #10b981)',
                boxShadow: '0 8px 24px -6px rgba(13, 148, 136, 0.45)',
              }}
            >
              <Send className="w-4 h-4" />
              שלח
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Ctrl+Enter לשליחה מהירה</p>
        </div>
      </div>
    </div>
  );
}
