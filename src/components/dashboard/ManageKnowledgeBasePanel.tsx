import { useEffect, useState, type FormEvent } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CloudDownload,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Trash2,
  Plus,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { KnowledgeFact } from '../../types';
import { getKnowledgeSourceBadgeText } from '../../utils/knowledgeSourceBadge';
import { KNOWLEDGE_TEASER_MAX_CHARS } from '../../utils/knowledgeFactNormalize';

export default function ManageKnowledgeBasePanel() {
  const {
    knowledgeFacts,
    addManualKnowledgeFact,
    removeKnowledgeFact,
    refreshKnowledgeBaseFromCloud,
    supabaseConfigured,
  } = usePatient();

  const [pullBusy, setPullBusy] = useState(false);
  const [teaser, setTeaser] = useState('');
  const [title, setTitle] = useState('');
  const [explanation, setExplanation] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    void (async () => {
      setPullBusy(true);
      try {
        await refreshKnowledgeBaseFromCloud();
      } finally {
        if (!cancelled) setPullBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseConfigured, refreshKnowledgeBaseFromCloud]);

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const tTeaser = teaser.trim();
    const tTitle = title.trim();
    const tExpl = explanation.trim();
    const tUrl = sourceUrl.trim();
    if (!tTitle) {
      setFormError('נא למלא כותרת למודאל.');
      return;
    }
    if (!tExpl) {
      setFormError('נא למלא הסבר מקצועי.');
      return;
    }
    if (!tUrl) {
      setFormError('נא להזין קישור למאמר.');
      return;
    }
    if (tTeaser.length > KNOWLEDGE_TEASER_MAX_CHARS) {
      setFormError(`טיזר קצר: עד ${KNOWLEDGE_TEASER_MAX_CHARS} תווים.`);
      return;
    }
    addManualKnowledgeFact({
      teaser: tTeaser,
      title: tTitle,
      explanation: tExpl,
      sourceUrl: tUrl,
    });
    setTeaser('');
    setTitle('');
    setExplanation('');
    setSourceUrl('');
  };

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl" style={{ background: '#f1f5f9' }}>
      <header className="mb-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-teal-700 mb-1">
          <BookOpen className="w-5 h-5 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wide">ניהול תוכן קליני</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900">ניהול בסיס הידע — הידעת?</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-2xl">
          הוספת עובדה מפרסמת אותה מיד למטופלים בפורטל (אין שלב אישור נפרד). התוכן והקישור נשמרים במערכת
          וב־Supabase כאשר מוגדר.
        </p>
        <div
          className="mt-4 max-w-2xl rounded-xl border-2 border-amber-300/90 bg-amber-50 px-4 py-3 flex gap-3 items-start shadow-sm"
          role="status"
        >
          <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs text-amber-950 leading-relaxed">
              <span className="font-bold">שימו לב:</span> הקישור החיצוני מוצג למטופלים. נא לוודא שהוא מוביל
              למקור המתוכנן לפני ההוספה.
            </p>
            <p
              dir="ltr"
              lang="en"
              className="text-[10px] sm:text-[11px] text-amber-900/80 leading-relaxed text-start"
            >
              Notice: Patients may open the external link. Verify the URL before adding a fact.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700">
            במאגר: {knowledgeFacts.length}
          </span>
          {pullBusy && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              מסנכרן מענן…
            </span>
          )}
          {supabaseConfigured && (
            <button
              type="button"
              disabled={pullBusy}
              onClick={() => void refreshKnowledgeBaseFromCloud()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <CloudDownload className="w-3.5 h-3.5 shrink-0" />
              רענון מ־Supabase
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-5">
        <form
          onSubmit={submitAdd}
          className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-800">הוספת עובדה חדשה</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                טיזר לבועה (עד {KNOWLEDGE_TEASER_MAX_CHARS} תווים)
              </label>
              <input
                type="text"
                value={teaser}
                maxLength={KNOWLEDGE_TEASER_MAX_CHARS}
                onChange={(e) => setTeaser(e.target.value)}
                placeholder="משפט קצר שיופיע על הענן"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {teaser.length}/{KNOWLEDGE_TEASER_MAX_CHARS} — אם תשאירו ריק, ייעשה שימוש בתחילת הכותרת.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">כותרת במודאל</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="כותרת מושכת למסך המורחב"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                הסבר מקצועי (יוצג בגלילה ארוכה בפורטל)
              </label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                rows={6}
                placeholder="תוכן מפורט — המטופל יוכל לגלול ולקרוא במודאל"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm resize-y min-h-[120px] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">קישור למקור</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
                dir="ltr"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-teal-600 to-emerald-600 shadow-md hover:opacity-95"
          >
            <Plus className="w-4 h-4 shrink-0" />
            הוסף עובדה
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-sm font-bold text-slate-800">העובדות שלכם ({knowledgeFacts.length})</h2>
          </div>
          {knowledgeFacts.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                עדיין אין עובדות. הוסיפו ראשונה בטופס למעלה.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[min(70vh,720px)] overflow-y-auto">
              {knowledgeFacts.map((f) => (
                <KnowledgeFactRow key={f.id} fact={f} onDelete={() => removeKnowledgeFact(f.id)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const DELETE_KB_CONFIRM_MSG =
  'האם אתה בטוח שברצונך למחוק מאמר זה? פעולה זו אינה ניתנת לביטול.';

function KnowledgeFactRow({ fact, onDelete }: { fact: KnowledgeFact; onDelete: () => void }) {
  const requestDelete = () => {
    if (typeof window !== 'undefined' && window.confirm(DELETE_KB_CONFIRM_MSG)) {
      onDelete();
    }
  };

  return (
    <li className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              מוצג בפורטל
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{fact.id}</span>
          </div>
          <p className="text-[11px] font-semibold text-sky-800 bg-sky-50/80 border border-sky-100 rounded-lg px-2 py-1 inline-block max-w-full mt-1">
            בועה: {fact.teaser}
          </p>
          <p className="text-sm font-bold text-slate-900 leading-snug mt-2">{fact.title}</p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{fact.explanation}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-900">
              {getKnowledgeSourceBadgeText(fact.sourceUrl)}
            </span>
            <a
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              פתיחת המקור
            </a>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto sm:min-w-[140px]">
          <button
            type="button"
            onClick={requestDelete}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-red-200 bg-red-50 text-red-800 hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
            מחק
          </button>
        </div>
      </div>
    </li>
  );
}
