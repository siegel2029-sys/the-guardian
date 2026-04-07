import type { ReactNode } from 'react';
import { Activity, MessageSquare, Flame, ShieldAlert } from 'lucide-react';
import type { Patient } from '../../../types';

type Props = {
  patient: Patient;
  avgPain7d: number | null;
  currentPain: number | null;
  unreadFromPatient: number;
  lastAlertIso: string | null;
};

function MiniCard({
  title,
  children,
  icon: Icon,
  accent,
}: {
  title: string;
  children: ReactNode;
  icon: typeof Activity;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border bg-white p-4 shadow-sm"
      style={{ borderColor: '#e2e8f0' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <span className="text-xs font-semibold text-slate-600">{title}</span>
      </div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default function ClinicalSummaryStrip({
  patient,
  avgPain7d,
  currentPain,
  unreadFromPatient,
  lastAlertIso,
}: Props) {
  const pctXp = Math.min(100, Math.round((patient.xp / patient.xpForNextLevel) * 100));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4" dir="rtl">
      <MiniCard title="כאב ומאמץ (VAS)" icon={Activity} accent="#2563eb">
        <div className="space-y-1">
          <p className="font-bold text-slate-900 tabular-nums">
            ממוצע 7 ימים:{' '}
            <span style={{ color: '#1d4ed8' }}>
              {avgPain7d != null ? avgPain7d.toFixed(1) : '—'}
            </span>
            <span className="text-slate-400 font-normal text-xs"> /10</span>
          </p>
          <p className="text-xs text-slate-500">
            כאב נוכחי (אחרון):{' '}
            <span className="font-semibold text-slate-700">
              {currentPain != null ? `${currentPain}/10` : 'אין דיווח'}
            </span>
          </p>
        </div>
      </MiniCard>

      <MiniCard title="הודעות" icon={MessageSquare} accent="#7c3aed">
        {unreadFromPatient > 0 ? (
          <p className="font-bold" style={{ color: '#6d28d9' }}>
            {unreadFromPatient} הודעות שלא נקראו מהמטופל
          </p>
        ) : (
          <p className="text-slate-500">אין הודעות חדשות ממתינות</p>
        )}
      </MiniCard>

      <MiniCard title="מעורבות" icon={Flame} accent="#059669">
        <div className="space-y-2">
          <p className="text-xs">
            רצף נוכחי:{' '}
            <span className="font-bold text-slate-900">{patient.currentStreak} ימים</span>
          </p>
          <p className="text-xs">
            סה״כ סשנים:{' '}
            <span className="font-bold text-slate-900">{patient.analytics.totalSessions}</span>
          </p>
          <p className="text-xs">
            רמה {patient.level} · {patient.xp}/{patient.xpForNextLevel} XP
          </p>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pctXp}%`, background: 'linear-gradient(90deg, #2563eb, #3b82f6)' }}
            />
          </div>
        </div>
      </MiniCard>

      <MiniCard title="בטיחות" icon={ShieldAlert} accent="#dc2626">
        {lastAlertIso ? (
          <>
            <p className="font-semibold text-red-800 text-xs leading-relaxed">
              התראת חירום / בטיחות אחרונה
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {new Date(lastAlertIso).toLocaleString('he-IL', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </>
        ) : patient.hasRedFlag ? (
          <p className="text-amber-800 text-xs font-semibold">דגל אדום פעיל — עקבו אחרי תיק</p>
        ) : (
          <p className="text-slate-500 text-xs">אין התראת חירום רשומה לאחרונה במערכת</p>
        )}
      </MiniCard>
    </div>
  );
}
