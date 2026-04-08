import { useEffect, useState, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

export interface ExerciseVideoTimerModalProps {
  open: boolean;
  title: string;
  videoUrl: string;
  /** Countdown seconds before «בוצע» unlocks */
  primeSeconds?: number;
  onClose: () => void;
  onMarkDone: () => void;
}

export default function ExerciseVideoTimerModal({
  open,
  title,
  videoUrl,
  primeSeconds = 30,
  onClose,
  onMarkDone,
}: ExerciseVideoTimerModalProps) {
  const [remaining, setRemaining] = useState(primeSeconds);
  const videoRef = useRef<HTMLVideoElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetAndStart = useCallback(() => {
    setRemaining(primeSeconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, [primeSeconds]);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    resetAndStart();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [open, resetAndStart]);

  useEffect(() => {
    if (!open || !videoUrl) return;
    const id = requestAnimationFrame(() => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = 0;
      v.muted = false;
      v.play().catch(() => {});
    });
    return () => cancelAnimationFrame(id);
  }, [open, videoUrl]);

  if (!open) return null;

  const canComplete = remaining === 0;

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15, 23, 42, 0.72)' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ex-video-modal-title"
    >
      <div
        className="w-full max-w-[min(96vw,960px)] max-h-[min(94vh,900px)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: '#0f172a',
          borderColor: '#334155',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-700/80">
          <h2 id="ex-video-modal-title" className="text-sm font-bold text-white truncate flex-1 min-w-0">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative aspect-video w-full bg-black shrink-0">
          {videoUrl ? (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain"
              src={videoUrl}
              controls
              playsInline
              loop
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm px-6 text-center">
              <p className="font-semibold text-slate-300 mb-1">אין סרטון הדגמה</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                המתינו לסיום הטיימר — ואז אשרו ביצוע
              </p>
            </div>
          )}
        </div>

        <div className="px-4 py-4 space-y-3 flex flex-col flex-1 min-h-0">
          <div
            className="rounded-xl px-3 py-2.5 text-center text-sm font-medium"
            style={{
              background: 'rgba(30, 41, 59, 0.95)',
              color: '#e2e8f0',
              border: '1px solid #475569',
            }}
          >
            <span className="tabular-nums text-lg font-black text-teal-300">{remaining}</span>
            <span className="text-slate-400 mr-2">שניות</span>
          </div>

          <p className="text-xs text-center text-slate-400 leading-relaxed px-1">
            {videoUrl
              ? 'צפו בהדגמה — לאחר מכן אשרו ביצוע'
              : 'המתינו לסיום הספירה — ואז אשרו ביצוע'}
          </p>

          <button
            type="button"
            disabled={!canComplete}
            onClick={() => {
              onMarkDone();
              onClose();
            }}
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale"
            style={{
              background: canComplete
                ? 'linear-gradient(135deg, #059669, #0d9488)'
                : '#334155',
              color: '#fff',
              boxShadow: canComplete ? '0 4px 14px rgba(13, 148, 136, 0.35)' : 'none',
            }}
          >
            בוצע
          </button>
        </div>
      </div>
    </div>
  );
}
