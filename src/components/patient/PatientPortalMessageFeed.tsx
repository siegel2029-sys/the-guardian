import { memo, useEffect, useMemo } from 'react';
import { User, Bot, Clock } from 'lucide-react';
import type { Message } from '../../types';
import { usePatient } from '../../context/PatientContext';

type Props = {
  patientId: string;
  careGiverName: string;
};

function PatientPortalMessageFeed({ patientId, careGiverName }: Props) {
  const { messages, getPatientMessages, markMessageRead } = usePatient();

  const portalMessages = useMemo(
    () => getPatientMessages(patientId),
    [patientId, getPatientMessages, messages]
  );

  useEffect(() => {
    const unreadIds = portalMessages
      .filter((m) => !m.fromPatient && !m.isRead)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      unreadIds.forEach((id) => markMessageRead(id));
    }
  }, [patientId, portalMessages, markMessageRead]);

  const sortedMessages = useMemo(
    () => [...portalMessages].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [portalMessages]
  );

  return (
    <div className="space-y-2 min-h-[120px] ps-0.5 pe-0.5">
      {sortedMessages.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">אין הודעות עדיין</p>
      ) : (
        sortedMessages.map((msg) => (
          <PortalMessageBubble key={msg.id} msg={msg} careGiverName={careGiverName} />
        ))
      )}
    </div>
  );
}

function PortalMessageBubble({
  msg,
  careGiverName,
}: {
  msg: Message;
  careGiverName: string;
}) {
  const fromMe = msg.fromPatient && !msg.aiClinicalAlert;
  const isAi = !!msg.aiClinicalAlert;
  const tier = msg.clinicalSafetyTier;
  const alignEnd = fromMe;
  const alertStyle =
    isAi && tier === 'emergency'
      ? { background: '#fef2f2', borderColor: '#f87171' }
      : isAi && tier === 'high_priority'
        ? { background: '#fffbeb', borderColor: '#fbbf24' }
        : isAi
          ? { background: '#eef2ff', borderColor: '#a5b4fc' }
          : fromMe
            ? { background: '#ecfdf5', borderColor: '#6ee7b7' }
            : { background: '#ffffff', borderColor: '#e2e8f0' };
  const senderLabel = isAi
    ? tier === 'emergency'
      ? 'עדכון דחוף'
      : tier === 'high_priority'
        ? 'עדכון בטיחות'
        : 'עדכון מהמערכת'
    : fromMe
      ? 'אני'
      : careGiverName;

  return (
    <div className={`flex ${alignEnd ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[88%] rounded-2xl px-3 py-2.5 border-2 shadow-sm"
        style={alertStyle}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {isAi ? (
            <Bot className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
          ) : (
            <User className="w-4 h-4 text-medical-primary shrink-0" aria-hidden="true" />
          )}
          <span className="text-xs font-bold text-slate-600">{senderLabel}</span>
        </div>
        <p className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed">
          {msg.content}
        </p>
        <div className="flex items-center gap-1 mt-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span className="text-xs text-slate-500">
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
}

export default memo(PatientPortalMessageFeed);
