import { Lock, MessageCircle } from 'lucide-react';

/**
 * Professional locked state for self-guided / unassisted plans (allowChat === false).
 */
export default function PatientPortalChatLocked() {
  return (
    <section
      className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 w-full max-w-lg mx-auto"
      aria-label="צ'אט אינו כלול במסלול"
      dir="rtl"
    >
      <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-7 h-7 text-slate-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold text-slate-900">מרכז הודעות</p>
            <p className="text-sm text-slate-500">תוכנית תרגול עצמאית</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-6 text-center bg-slate-50/80">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200/80 text-slate-600 border border-slate-300">
          <Lock className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-base font-bold text-slate-900">הצ׳אט אינו כלול במסלול שלך</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            תוכנית התרגול העצמאית אינה כוללת שיחה ישירה עם המטפל. כך נשמר זמן הליווי הקליני
            למטופלים במסלול האישי. להמשך תמיכה או שדרוג למסלול עם ליווי — פנו לקליניקה.
          </p>
        </div>
      </div>
    </section>
  );
}
