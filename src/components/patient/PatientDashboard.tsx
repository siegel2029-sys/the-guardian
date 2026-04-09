import { Siren } from 'lucide-react';

/** אזור לוח הבית בפורטל — שכבת בטיחות נוספת לדגל אדום */
export default function PatientDashboard({ onOpenRedFlag }: { onOpenRedFlag: () => void }) {
  return (
    <section className="mb-4" aria-label="דיווח דחוף מהדשבורד">
      <button
        type="button"
        onClick={onOpenRedFlag}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl font-black text-red-950 text-sm sm:text-base border-2 border-red-600 bg-red-100 hover:bg-red-200/90 transition-colors"
      >
        <Siren className="w-7 h-7 shrink-0 text-red-600" strokeWidth={2.4} />
        <span className="text-center">
          <span className="block">דיווח דחוף / Red Flag</span>
          <span className="block text-[11px] font-semibold text-red-800/90 mt-0.5">
            דוא״ל מיידי למטפל + עדכון בפורטל
          </span>
        </span>
      </button>
    </section>
  );
}
