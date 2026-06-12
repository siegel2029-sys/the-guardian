import { Route } from 'lucide-react';
import type { Patient } from '../../../types';
import { loadLatestIntakeFields } from '../../../utils/clinicalIntakeVersions';
import { formatContinuationProtocol } from '../../../utils/continuationProtocolDisplay';

type Props = {
  patient: Patient;
  onEditClick?: () => void;
};

export default function PatientContinuationProtocolSection({ patient, onEditClick }: Props) {
  const fields = loadLatestIntakeFields(patient);
  const continuationProtocol = formatContinuationProtocol(fields.treatmentProtocol);
  const prognosis = fields.prognosisHypothesis?.trim() ?? '';
  const hasProtocol = continuationProtocol.length > 0;
  const hasPrognosis = prognosis.length > 0;
  const hasContent = hasProtocol || hasPrognosis;

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden"
      aria-label="פרוטוקול המשך טיפול ופרוגנוזה"
      dir="rtl"
    >
      <div className="border-b border-slate-200/80 px-4 py-4 sm:px-5 bg-gradient-to-l from-violet-50/50 to-slate-50/80">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-violet-700 shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-black text-slate-900">פרוטוקול המשך טיפול ופרוגנוזה</h3>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {!hasContent ? (
          <p className="text-sm text-purple-400/90 leading-relaxed">
            טרם הוגדר פרוטוקול המשך או פרוגנוזה
            {onEditClick && (
              <>
                {' — '}
                <button
                  type="button"
                  onClick={onEditClick}
                  className="font-semibold text-purple-600 underline underline-offset-2 hover:text-purple-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
                >
                  עדכון בסיכום אינטייק מלא
                </button>
              </>
            )}
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                פרוטוקול המשך הטיפול
              </h4>
              {hasProtocol ? (
                <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {continuationProtocol}
                </p>
              ) : (
                <p className="text-sm text-slate-400 leading-relaxed">
                  טרם הוגדר פרוטוקול המשך
                  {onEditClick && (
                    <>
                      {' — '}
                      <button
                        type="button"
                        onClick={onEditClick}
                        className="font-semibold text-purple-600 underline underline-offset-2 hover:text-purple-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
                      >
                        הוספה
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                פרוגנוזה
              </h4>
              {hasPrognosis ? (
                <p className="text-sm leading-relaxed text-slate-800">{prognosis}</p>
              ) : (
                <p className="text-sm text-slate-400 leading-relaxed">
                  טרם הוגדרה פרוגנוזה
                  {onEditClick && (
                    <>
                      {' — '}
                      <button
                        type="button"
                        onClick={onEditClick}
                        className="font-semibold text-purple-600 underline underline-offset-2 hover:text-purple-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
                      >
                        הוספה
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
