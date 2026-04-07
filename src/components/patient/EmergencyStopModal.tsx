import { AlertOctagon, Phone, MessageCircle } from 'lucide-react';
import { EMERGENCY_STOP_MODAL_BODY } from '../../safety/clinicalEmergencyScreening';

interface EmergencyStopModalProps {
  open: boolean;
  syndromeDetailHebrew?: string;
  onAcknowledge: () => void;
  onOpenTherapistMessage: () => void;
}

export default function EmergencyStopModal({
  open,
  syndromeDetailHebrew,
  onAcknowledge,
  onOpenTherapistMessage,
}: EmergencyStopModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(69, 10, 10, 0.88)' }}
      dir="rtl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="emergency-title"
      aria-describedby="emergency-desc"
    >
      <div
        className="w-full max-w-lg rounded-3xl border-4 shadow-2xl overflow-hidden"
        style={{
          borderColor: '#fecaca',
          background: 'linear-gradient(180deg, #fef2f2 0%, #ffffff 55%)',
          boxShadow: '0 0 0 4px rgba(220, 38, 38, 0.35), 0 25px 50px -12px rgba(127, 29, 29, 0.5)',
        }}
      >
        <div className="px-6 py-5 text-center" style={{ background: '#b91c1c' }}>
          <AlertOctagon className="w-14 h-14 text-white mx-auto mb-2" strokeWidth={2.2} />
          <h2 id="emergency-title" className="text-xl font-black text-white leading-tight">
            עצור הכל!
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4" id="emergency-desc">
          <p className="text-base font-bold text-red-950 leading-relaxed text-center">
            {EMERGENCY_STOP_MODAL_BODY}
          </p>
          {syndromeDetailHebrew ? (
            <p className="text-sm text-red-900/90 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 leading-relaxed">
              <span className="font-semibold">זיהוי מערכת: </span>
              {syndromeDetailHebrew}
            </p>
          ) : null}
          <p className="text-sm text-slate-700 leading-relaxed text-center">
            רשימת התרגילים ננעלה עד שמטפל יאשר המשך — זה למנוע נזק. שמרו על שקט, אל תבצעו תרגילי שיקום
            עד להערכה רפואית.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href="tel:101"
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-black text-lg shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
                boxShadow: '0 12px 28px -8px rgba(127, 29, 29, 0.6)',
              }}
            >
              <Phone className="w-6 h-6" />
              מד״א — 101
            </a>
            <button
              type="button"
              onClick={onOpenTherapistMessage}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold border-2 border-red-300 text-red-900 bg-white hover:bg-red-50 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              שליחה למטפל
            </button>
          </div>

          <button
            type="button"
            onClick={onAcknowledge}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
          >
            הבנתי — לא אתאמן עד אישור מטפל
          </button>
        </div>
      </div>
    </div>
  );
}
