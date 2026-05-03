import type { ClinicalTimelineEntry } from '../../../types';

type Props = {
  entries: ClinicalTimelineEntry[];
};

export default function ClinicalTimeline({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
        אין עדיין רשומות בציר הזמן. לאחר אישור טיוטת ה־AI או הערה — היא תוצג כאן.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {sorted.map((e) => {
        const when = new Date(e.createdAt).toLocaleString('he-IL', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        return (
          <li
            key={e.id}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <time className="block text-xs font-semibold text-slate-500 mb-2 tabular-nums">{when}</time>
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{e.text}</p>
          </li>
        );
      })}
    </ol>
  );
}
