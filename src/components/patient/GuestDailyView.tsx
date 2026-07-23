/**
 * App Store / freemium portal shell — placeholder until GuestDailyView product UI ships.
 * Routed by {@link FreemiumGuard} when `app_metadata.patient_id` is unset and tier is free.
 */
export default function GuestDailyView() {
  return (
    <main
      dir="rtl"
      className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 py-12 bg-gradient-to-b from-teal-50 via-white to-slate-50 text-slate-800"
    >
      <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Physio-Shield</h1>
      <p className="text-sm text-slate-600 text-center max-w-md leading-relaxed">
        גרסת האורח (חינמית) בדרך. הזמנה מהקליניקה מעבירה אתכם לפורטל המלא.
      </p>
      <p className="text-xs text-slate-500 text-center max-w-sm">
        GuestDailyView — foundational freemium surface. Clinic invite accounts use the pro portal.
      </p>
    </main>
  );
}
