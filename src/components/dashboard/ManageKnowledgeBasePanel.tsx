import { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  CloudDownload,
  Loader2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { useAuth } from '../../context/AuthContext';
import { generateKnowledgeFactsWithGemini } from '../../ai/geminiKnowledgeFacts';
import { getGeminiApiKey } from '../../ai/geminiClient';
import type { KnowledgeFact } from '../../types';

export default function ManageKnowledgeBasePanel() {
  const {
    knowledgeFacts,
    approveKnowledgeFact,
    appendPendingKnowledgeFactsFromAi,
    refreshKnowledgeBaseFromCloud,
    supabaseConfigured,
  } = usePatient();
  const { therapist } = useAuth();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOk, setAiOk] = useState<string | null>(null);
  const [pullBusy, setPullBusy] = useState(false);

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

  const pending = knowledgeFacts.filter((f) => !f.isApproved);
  const approved = knowledgeFacts.filter((f) => f.isApproved);

  const runGemini = async () => {
    setAiError(null);
    setAiOk(null);
    if (!getGeminiApiKey()) {
      setAiError('הגדירו VITE_GEMINI_API_KEY בקובץ .env והפעילו מחדש את השרת.');
      return;
    }
    setAiBusy(true);
    try {
      const batch = await generateKnowledgeFactsWithGemini({
        therapistTitle: therapist?.title,
      });
      appendPendingKnowledgeFactsFromAi(batch);
      setAiOk(`נוספו ${batch.length} עובדות לתור אישור.`);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
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
          רק עובדות שאושרו כאן מוצגות למטופלים בפורטל. האישור נשמר במערכת וב־Supabase (כאשר מוגדר) —
          לא תתבקשו לאשר שוב את אותה עובדה.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700">
            מאושרות: {approved.length}
          </span>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900">
            ממתינות לאישור: {pending.length}
          </span>
          {pullBusy && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              מסנכרן מענן…
            </span>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-5">
        <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            הרחבה עם בינה מלאכותית (Gemini)
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-4">
            יוצר עובדות חדשות בעברית בהתאם להתמחות בפיזיותרפיה
            {therapist?.title ? ` (${therapist.title})` : ''}. העובדות ייכנסו לתור &quot;ממתין לאישור&quot;
            — יש לבדוק דיוק קליני וקישורים לפני אישור.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => void runGemini()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 bg-gradient-to-l from-violet-600 to-indigo-600 shadow-md"
            >
              {aiBusy ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 shrink-0" />
              )}
              ייצר עובדות נוספות עם AI
            </button>
            {supabaseConfigured && (
              <button
                type="button"
                disabled={pullBusy}
                onClick={() => void refreshKnowledgeBaseFromCloud()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                <CloudDownload className="w-4 h-4 shrink-0" />
                רענון מ־Supabase
              </button>
            )}
          </div>
          {aiError && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {aiError}
            </p>
          )}
          {aiOk && (
            <p className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              {aiOk}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-sm font-bold text-slate-800">כל העובדות ({knowledgeFacts.length})</h2>
          </div>
          <ul className="divide-y divide-slate-100 max-h-[min(70vh,720px)] overflow-y-auto">
            {knowledgeFacts.map((f) => (
              <KnowledgeFactRow key={f.id} fact={f} onApprove={() => approveKnowledgeFact(f.id)} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KnowledgeFactRow({ fact, onApprove }: { fact: KnowledgeFact; onApprove: () => void }) {
  return (
    <li className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {fact.isApproved ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                מאושר
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
                <Clock className="w-3 h-3" />
                ממתין לאישור
              </span>
            )}
            {fact.source === 'ai' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200">
                AI
              </span>
            )}
            <span className="text-[10px] text-slate-400 font-mono">{fact.id}</span>
          </div>
          <p className="text-sm font-bold text-slate-900 leading-snug">{fact.title}</p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{fact.explanation}</p>
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-teal-700 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            מקור מקצועי
          </a>
        </div>
        {!fact.isApproved && (
          <button
            type="button"
            onClick={onApprove}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-teal-600 to-emerald-600 shadow-sm hover:opacity-95"
          >
            אשר מאמר
          </button>
        )}
      </div>
    </li>
  );
}
