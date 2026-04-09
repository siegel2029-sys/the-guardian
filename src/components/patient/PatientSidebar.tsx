import { AlertOctagon } from 'lucide-react';

/** סרגל עליון בפורטל — כפתור דגל אדום בולט */
export default function PatientSidebar({ onOpenRedFlag }: { onOpenRedFlag: () => void }) {
  return (
    <aside className="mb-4" aria-label="פעולות דחופות">
      <button
        type="button"
        onClick={onOpenRedFlag}
        className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl font-black text-white text-sm sm:text-base border-2 border-red-950/20 shadow-lg motion-safe:animate-pulse"
        style={{
          background: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 45%, #f87171 100%)',
          boxShadow: '0 12px 36px -10px rgba(220, 38, 38, 0.75), 0 0 0 1px rgba(254,202,202,0.5)',
        }}
      >
        <AlertOctagon className="w-6 h-6 shrink-0" strokeWidth={2.5} />
        <span className="text-center leading-tight">
          דיווח דחוף / Red Flag
          <span className="block text-[11px] font-bold opacity-95 mt-0.5">לחצו לשליחת דוא״ל למטפל</span>
        </span>
      </button>
    </aside>
  );
}
