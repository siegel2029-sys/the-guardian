import { useCallback, useId, useState, type FormEvent } from 'react';
import { Activity, Building2, CheckCircle2, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MOVEMENT_TIPS = [
  {
    title: 'חימום קצר',
    body: '2–3 דקות הליכה במקום או סיבובי כתפיים לפני כל תרגול.',
  },
  {
    title: 'נשימה יציבה',
    body: 'נשפו בזמן המאמץ ונשמו פנימה בשיחרור — זה מפחית מתח מיותר.',
  },
  {
    title: 'כאב ≠ התקדמות',
    body: 'אי־נוחות קלה בסדר; כאב חד או מקרין — עצרו ופנו למטפל.',
  },
] as const;

const SAMPLE_EXERCISES = [
  {
    name: 'גשר ישבן (Glute Bridge)',
    reps: '8–10 חזרות × 2',
    cue: 'שכבו על הגב, ברכיים כפופות, הרימו את האגן באיטיות.',
  },
  {
    name: 'מתיחת חזה בפתח',
    reps: '20–30 שניות × 2 לכל צד',
    cue: 'יד על משקוף, סובבו את הגוף עד מתיחה עדינה בחזה.',
  },
  {
    name: 'כפיפת ברך בעמידה',
    reps: '10 חזרות × 2 לכל רגל',
    cue: 'החזיקו במשענת, קרבו עקב לישבן מבלי לקשת את הגב.',
  },
] as const;

/**
 * App Store / freemium portal surface — routed by FreemiumGuard when tier is free.
 * No clinic patient payload; invite code entry is UX-only until clinic linking ships.
 */
export default function GuestDailyView() {
  const { logout } = useAuth();
  const inviteFieldId = useId();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteHint, setInviteHint] = useState<string | null>(null);

  const onSubmitInvite = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const code = inviteCode.trim();
      if (!code) {
        setInviteHint('נא להזין קוד הזמנה מהקליניקה.');
        return;
      }
      // Clinic invite activation still uses the portal signup path with patient_id/invite_code.
      setInviteHint(
        'שמרו את הקוד וצרו / התחברו מחשבון ההזמנה של הקליניקה במסך ההתחברות. הפורטל המלא ייפתח אוטומטית.'
      );
    },
    [inviteCode]
  );

  return (
    <main
      dir="rtl"
      className="min-h-dvh bg-gradient-to-b from-teal-50 via-white to-slate-50 text-slate-800"
    >
      <header className="sticky top-0 z-20 border-b border-teal-100/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-teal-900">Physio-Shield</p>
            <p className="text-xs text-slate-500">גרסת אורח · תרגול כללי</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            aria-label="התנתק"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            יציאה
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 pb-16">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 px-5 py-7 text-white shadow-lg shadow-teal-900/20">
          <div
            className="pointer-events-none absolute -left-8 -top-10 h-40 w-40 rounded-full bg-teal-400/20 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              חינם לכולם
            </span>
            <h1 className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
              תנועה יומית שמתחילה כאן
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-teal-50/95">
              טיפים ותרגילים כלליים לשמירה על שגרה. תוכנית אישית, מעקב מטפל והתראות מגיעים עם חיבור
              לקליניקה.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setInviteHint(null);
                  setInviteOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-50"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                התחבר לקליניקה / שדרג לתוכנית אישית
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="guest-tips-heading" className="flex flex-col gap-3">
          <h2 id="guest-tips-heading" className="text-base font-semibold text-slate-900">
            טיפים לתנועה בטוחה
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {MOVEMENT_TIPS.map((tip) => (
              <li
                key={tip.title}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-100"
              >
                <p className="text-sm font-semibold text-teal-800">{tip.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{tip.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="guest-samples-heading" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-700" aria-hidden="true" />
            <h2 id="guest-samples-heading" className="text-base font-semibold text-slate-900">
              תרגילים לדוגמה
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            כלליים בלבד — לא מחליפים הערכה קלינית. עצרו בכל כאב חד.
          </p>
          <ul className="flex flex-col gap-3">
            {SAMPLE_EXERCISES.map((ex) => (
              <li
                key={ex.name}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-100"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{ex.name}</p>
                  <span className="text-[11px] font-medium tabular-nums text-teal-700">{ex.reps}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{ex.cue}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 px-4 py-5 text-center">
          <CheckCircle2 className="mx-auto h-5 w-5 text-teal-700" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-800">מוכנים לתוכנית אישית?</p>
          <p className="mt-1 text-xs text-slate-600">
            בקשו מהמטפל קוד הזמנה — והפורטל הקליני ייפתח עם התוכנית שלכם.
          </p>
          <button
            type="button"
            onClick={() => {
              setInviteHint(null);
              setInviteOpen(true);
            }}
            className="mt-3 text-sm font-semibold text-teal-800 underline-offset-2 hover:underline"
          >
            יש לי קוד הזמנה
          </button>
        </section>
      </div>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setInviteOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-invite-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="guest-invite-title" className="text-base font-semibold text-slate-900">
              חיבור לקליניקה
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              הזינו את קוד ההזמנה שקיבלתם מהמטפל. החשבון הקליני נפתח דרך מסך ההתחברות עם פרטי
              ההזמנה.
            </p>
            <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmitInvite}>
              <label htmlFor={inviteFieldId} className="text-xs font-medium text-slate-700">
                קוד הזמנה
              </label>
              <input
                id={inviteFieldId}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2"
                placeholder="לדוגמה: הקוד מההודעה של הקליניקה"
              />
              {inviteHint && (
                <p className="text-xs leading-relaxed text-teal-800" role="status">
                  {inviteHint}
                </p>
              )}
              <div className="mt-1 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  המשך
                </button>
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  סגור
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
