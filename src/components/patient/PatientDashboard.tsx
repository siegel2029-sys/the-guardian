import { Siren } from 'lucide-react';

/** אזור לוח הבית בפורטל — שכבת בטיחות נוספת לדגל אדום */
export default function PatientDashboard({ onOpenRedFlag }: { onOpenRedFlag: () => void }) {
  return (
    <section className="mb-4" aria-label="דיווח דחוף מהדשבורד">
      <button
        type="button"
        onClick={onOpenRedFlag}
        className="w-full flex items-center justify-center gap-3 py-4 px-4 rounded-2xl font-black text-red-950 text-base sm:text-lg border-2 border-red-600 bg-white hover:bg-red-50 transition-colors shadow-md"
      >
        <Siren className="w-8 h-8 shrink-0 text-red-600" strokeWidth={2.4} />
        <span className="text-center">
          <span className="block leading-snug">דיווח דחוף / Red Flag</span>
          <span className="block text-sm font-semibold text-red-800/90 mt-1">
            דוא״ל מיידי למטפל + עדכון בפורטל
          </span>
        </span>
      </button>
    </section>
  );
}
