import { useState } from 'react';
import { Send, MessageSquare, Clock, User } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';

export default function MessagesPanel() {
  const { selectedPatient, getPatientMessages, markMessageRead, sendTherapistReply } =
    usePatient();
  const [replyText, setReplyText] = useState('');

  if (!selectedPatient) return null;

  const messages = getPatientMessages(selectedPatient.id);
  const unreadIds = messages.filter((m) => !m.isRead && m.fromPatient).map((m) => m.id);

  const handleMarkAllRead = () => {
    unreadIds.forEach((id) => markMessageRead(id));
  };

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendTherapistReply(selectedPatient.id, replyText.trim());
    setReplyText('');
  };

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-600" />
            הודעות — {selectedPatient.name}
          </h2>
          {unreadIds.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-teal-600 hover:text-teal-800 hover:underline transition-colors"
            >
              סמן הכל כנקרא ({unreadIds.length})
            </button>
          )}
        </div>

        {/* Messages List */}
        <div className="space-y-3 mb-4">
          {messages.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-teal-100">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">אין הודעות עדיין</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isFromPatient = msg.fromPatient;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isFromPatient ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[80%] rounded-2xl px-4 py-3 shadow-sm border"
                    style={
                      isFromPatient
                        ? { background: '#f0fffe', borderColor: '#a7f3d0' }
                        : { background: '#f8fafc', borderColor: '#e2e8f0' }
                    }
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isFromPatient ? (
                        <User className="w-3.5 h-3.5 text-teal-500" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="text-[10px] font-semibold text-slate-500">
                        {isFromPatient ? selectedPatient.name : 'המטפל'}
                      </span>
                      {!msg.isRead && isFromPatient && (
                        <span className="w-2 h-2 rounded-full bg-teal-500" />
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{msg.content}</p>
                    <div className="flex items-center gap-1 mt-1">
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

        {/* Reply Box */}
        <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm">
          <p className="text-xs font-medium text-slate-500 mb-2">שלח הודעה למטופל</p>
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="כתוב הודעה..."
              rows={3}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none transition-all placeholder:text-slate-400"
              onFocus={(e) => {
                e.target.style.borderColor = '#0d9488';
                e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '';
                e.target.style.boxShadow = '';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!replyText.trim()}
              className="self-end px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              <Send className="w-4 h-4" />
              שלח
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
