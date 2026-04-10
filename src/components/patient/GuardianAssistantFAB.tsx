import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { X, Send, Loader2, Sparkles } from 'lucide-react';
import type { Patient, PatientExercise } from '../../types';
import {
  buildGuardianTurn,
  isGuardianOfferConfirmation,
  type GuardianPendingOffer,
} from './build-guardian-reply';
import { analyzePatientProgress, buildPatientProgressPayload } from '../../ai/patientProgressReasoning';
import { screenPatientFreeTextForEmergency } from '../../safety/clinicalEmergencyScreening';
import { usePatient } from '../../context/PatientContext';
import { getGeminiApiKey } from '../../ai/geminiClient';
import { gordyPatientChatWithGemini } from '../../ai/geminiGordyPatient';

interface GuardianAssistantFABProps {
  patient: Patient;
  exerciseCount: number;
  exercises: PatientExercise[];
  onSubmitGuardianRepsRequest: (
    exerciseId: string,
    exerciseName: string,
    fromReps: number,
    toReps: number
  ) => void;
  /** התראת AI קלינית לתיבת המטפל */
  onTherapistClinicalAlert?: (detailHebrew?: string) => void;
  /** מילות מפתח חירום בטקסט המטופל — לזרימת הבטיחות */
  onPatientEmergencyText?: () => void;
  hidden?: boolean;
  /** ניסוח רך לפורטל מטופל (ללא מונחי דשבורד מטפל) */
  variant?: 'default' | 'portal';
}

export default function GuardianAssistantFAB({
  patient,
  exerciseCount,
  exercises,
  onSubmitGuardianRepsRequest,
  onTherapistClinicalAlert,
  onPatientEmergencyText,
  hidden,
  variant = 'default',
}: GuardianAssistantFABProps) {
  const isPortal = variant === 'portal';
  const { screenAndHandleEmergencyText } = usePatient();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [pendingOffer, setPendingOffer] = useState<GuardianPendingOffer | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useLayoutEffect(() => {
    if (!open || !isPortal) return;
    const id = requestAnimationFrame(() => modalInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, isPortal]);

  if (hidden) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || replyLoading) return;
    if (!open) setOpen(true);

    // חובה: סינון חירום לפני כל לוגיקה אחרת (הצעות, אישורים, buildGuardianTurn)
    const emergency = screenPatientFreeTextForEmergency(text);
    if (emergency.isEmergency) {
      onPatientEmergencyText?.();
      screenAndHandleEmergencyText(patient.id, text, 'צ׳אט Guardian');
      setMessages((m) => [
        ...m,
        { role: 'user', text },
        {
          role: 'assistant',
          text:
            isPortal
              ? 'זוהתה התאמה לתסמינים שדורשים בדיקה דחופה. הופיעה הודעה במערכת — אל תמשיך בתרגול עד שתקבל הנחיה מצוות הטיפול. אם המצב מחמיר, התקשרו ל־101.'
              : 'זוהתה התאמה לתסמינים שדורשים בדיקה דחופה. הופיעה הודעת חירום במערכת — אל תמשיך בתרגול עד שמטפל או גורם רפואי ינחה אותך. אם המצב מחמיר, התקשרו ל־101.',
        },
      ]);
      setPendingOffer(null);
      setInput('');
      setOpen(false);
      return;
    }

    if (pendingOffer && isGuardianOfferConfirmation(text)) {
      const payload = buildPatientProgressPayload(patient, exercises);
      const analysis = analyzePatientProgress(payload);
      if (!analysis.allowExerciseLoadIncrease) {
        if (analysis.suggestTherapistClinicalAlert) {
          onTherapistClinicalAlert?.(analysis.therapistAlertDetailHebrew);
        }
        const extra = analysis.suggestTherapistClinicalAlert
          ? isPortal
            ? '\n\nעדכנתי את צוות הטיפול — יחזרו אליך בהתאם.'
            : '\n\nעדכנתי את המטפל בהתראה במערכת — נדרשת החלטה מקצועית.'
          : '';
        setMessages((m) => [
          ...m,
          { role: 'user', text },
          {
            role: 'assistant',
            text:
              (analysis.refusalExplanationHebrew ??
                'לא ניתן לאשר כרגע הגדלת עומס מבחינה קלינית.') + extra,
          },
        ]);
        setPendingOffer(null);
        setInput('');
        return;
      }
      onSubmitGuardianRepsRequest(
        pendingOffer.exerciseId,
        pendingOffer.exerciseName,
        pendingOffer.fromReps,
        pendingOffer.toReps
      );
      setMessages((m) => [
        ...m,
        { role: 'user', text },
        {
          role: 'assistant',
            text: isPortal
              ? 'מצוין! שלחתי בקשה לצוות הטיפול. אחרי אישור מקצועי יתעדכנו החזרות בתוכנית שלך.'
              : 'מצוין! שלחתי בקשה למטפל שלך. הוא יראה אותה תחת «אישורים ממתינים» ויוכל לאשר או לדחות — רק אחרי אישורו יתעדכנו החזרות בתוכנית.',
        },
      ]);
      setPendingOffer(null);
      setInput('');
      return;
    }

    const { reply, offer, sendTherapistClinicalAlert } = buildGuardianTurn(
      text,
      patient,
      exerciseCount,
      exercises
    );
    if (sendTherapistClinicalAlert) {
      onTherapistClinicalAlert?.(sendTherapistClinicalAlert.detailHebrew);
    }

    setMessages((m) => [...m, { role: 'user', text }]);
    setPendingOffer(offer);
    setInput('');

    let assistantText = reply;
    if (getGeminiApiKey()) {
      setReplyLoading(true);
      try {
        assistantText = await gordyPatientChatWithGemini({
          patient,
          exerciseCount,
          exercises,
          history: messages,
          userMessage: text,
        });
      } catch (err) {
        console.warn('[GuardianAssistantFAB] Gemini fallback to rule reply', err);
        assistantText = reply;
      } finally {
        setReplyLoading(false);
      }
    }

    setMessages((m) => [...m, { role: 'assistant', text: assistantText }]);
  };

  const portalBarBottom = 'calc(5.75rem + env(safe-area-inset-bottom, 0px))';
  const portalBarLeft = 'max(12px, env(safe-area-inset-left, 0px))';
  const PORTAL_INPUT_PLACEHOLDER = 'יש לך שאלה על השיקום? כתוב כאן';

  return (
    <>
      {isPortal && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed z-[65] flex w-[min(calc(100vw-1.5rem),22rem)] min-h-[3rem] items-center gap-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white/92 px-3.5 py-2.5 text-start shadow-sm backdrop-blur-md transition-all hover:border-slate-300/90 hover:bg-white active:scale-[0.99] motion-safe:duration-150"
          style={{ bottom: portalBarBottom, left: portalBarLeft }}
          dir="ltr"
          aria-label="פתיחת עוזר שיקום"
        >
          <Sparkles
            className="h-5 w-5 shrink-0 text-medical-primary"
            strokeWidth={2}
            aria-hidden
          />
          <span
            className="min-w-0 flex-1 truncate text-end text-[0.9375rem] font-medium text-slate-500"
            dir="rtl"
          >
            {PORTAL_INPUT_PLACEHOLDER}
          </span>
        </button>
      )}

      {!isPortal && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed z-[65] bottom-6 left-4 flex h-14 w-14 items-center justify-center rounded-xl text-white shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            boxShadow: '0 10px 26px -8px rgba(37, 99, 235, 0.45)',
          }}
          aria-label="פתיחת עוזר שיקום"
        >
          <Sparkles className="w-7 h-7 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      )}

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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-sky-50 border border-sky-100">
                  <Sparkles className="w-5 h-5 text-medical-primary shrink-0" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <h2 id="guardian-title" className="text-sm font-bold text-indigo-950 truncate">
                    {isPortal ? 'עוזר השיקום' : 'עוזר Guardian'}
                  </h2>
                  <p className="text-[11px] text-indigo-600/90">
                    {isPortal
                      ? 'שאלות על התרגול וההתקדמות — לצד צוות הטיפול'
                      : 'ניתוח כאב, רצף והתאמת עומס (ללא תחליף למטפל)'}
                  </p>
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
                  לדוגמה: «איך אני מתקדם?», «אם אני מרגיש כאב 6, מה לעשות?» או «התרגילים קלים לי».
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className="max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
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
              {replyLoading && (
                <div className="flex justify-end">
                  <div
                    className="max-w-[92%] rounded-2xl px-3 py-2 text-sm flex items-center gap-2 border border-indigo-100 bg-white text-indigo-700"
                  >
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    מכין תשובה…
                  </div>
                </div>
              )}
              {pendingOffer && (
                <p className="text-[11px] text-indigo-700 text-center px-2">
                  {isPortal
                    ? 'לשליחת בקשה לצוות הטיפול — ענו «כן» או «שלח».'
                    : 'אם תרצו לשלוח בקשה למטפל — ענו «כן» או «שלח».'}
                </p>
              )}
              <div ref={endRef} />
            </div>

            <div className="p-3 border-t shrink-0 flex gap-2" style={{ borderColor: '#e0e7ff' }}>
              <input
                ref={modalInputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !replyLoading && void send()}
                placeholder={
                  isPortal
                    ? PORTAL_INPUT_PLACEHOLDER
                    : 'שאלה או «כן» לאישור שליחה למטפל…'
                }
                className="flex-1 min-w-0 rounded-2xl border border-indigo-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                style={{ background: '#fafafa' }}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || replyLoading}
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
