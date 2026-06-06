import { useMemo } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Lightbulb,
  Stethoscope,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import type { Patient } from '../../../types';
import { buildClinicalIntakeInsightsDisplay } from '../../../utils/clinicalIntakeInsightsDisplay';

type Props = {
  patient: Patient;
  compact?: boolean;
  className?: string;
};

function BulletList({
  items,
  bulletClass = 'text-teal-700',
  textClass = 'text-slate-800',
}: {
  items: string[];
  bulletClass?: string;
  textClass?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 items-start text-sm leading-relaxed">
          <span className={`font-bold mt-0.5 shrink-0 ${bulletClass}`} aria-hidden>
            •
          </span>
          <span className={textClass}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ClinicalIntakeInsightsPanel({
  patient,
  compact = false,
  className = '',
}: Props) {
  const insights = useMemo(
    () => buildClinicalIntakeInsightsDisplay(patient),
    [patient]
  );

  const pad = compact ? 'p-3' : 'p-4';
  const heading = compact ? 'text-xs' : 'text-sm';

  if (!insights.hasAnyInsights) {
    return (
      <p className={`text-slate-500 italic text-center py-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        אין עדיין ניתוח AI — השלימו אינטייק קליני.
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`} dir="rtl">
      {insights.diagnosis && (
        <header className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            אבחון / רושם קליני
          </p>
          <p className={`font-black text-slate-900 mt-1 leading-snug ${heading}`}>
            {insights.diagnosis}
          </p>
        </header>
      )}

      {insights.storySummary && (
        <section
          className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
          aria-label="תמצית סיפור המטופל"
        >
          <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 mb-2">
            <FileText className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
            תמצית סיפור
          </h4>
          <p className="text-sm text-slate-800 leading-relaxed">{insights.storySummary}</p>
        </section>
      )}

      {insights.precautions.length > 0 && (
        <section
          className={`rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50/90 to-amber-50 shadow-sm ${pad}`}
          aria-label="ממה להיזהר"
        >
          <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden />
            ממה להיזהר / נקודות דגש
          </h4>
          <BulletList
            items={insights.precautions}
            bulletClass="text-amber-700"
            textClass="text-amber-950 font-medium"
          />
        </section>
      )}

      {insights.redFlags.length > 0 && (
        <section
          className={`rounded-xl border-2 border-red-300 bg-red-50/90 shadow-sm ${pad}`}
          aria-label="דגלים אדומים"
        >
          <h4 className="text-xs font-black text-red-900 flex items-center gap-1.5 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" aria-hidden />
            דגלים אדומים / אזהרות
          </h4>
          <BulletList
            items={insights.redFlags}
            bulletClass="text-red-600"
            textClass="text-red-900 font-medium"
          />
          {insights.redFlagAnalysis && (
            <p className="mt-2.5 text-sm text-red-900/90 leading-relaxed border-t border-red-200/80 pt-2">
              {insights.redFlagAnalysis}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {insights.differentialDiagnosis.length > 0 && (
          <section
            className={`rounded-xl border border-indigo-200 bg-indigo-50/60 ${pad}`}
            aria-label="אבחנה מבדלת"
          >
            <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5 mb-2">
              <Stethoscope className="w-4 h-4 shrink-0" aria-hidden />
              אבחנה מבדלת
            </h4>
            <BulletList items={insights.differentialDiagnosis} bulletClass="text-indigo-500" />
          </section>
        )}

        {insights.recommendedTests.length > 0 && (
          <section
            className={`rounded-xl border border-slate-200 bg-slate-50/90 ${pad}`}
            aria-label="בדיקות מומלצות"
          >
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-2">
              <FlaskConical className="w-4 h-4 text-slate-600 shrink-0" aria-hidden />
              בדיקות / המלצות להמשך
            </h4>
            <BulletList items={insights.recommendedTests} bulletClass="text-slate-500" />
          </section>
        )}
      </div>

      {insights.clinicalConclusions.length > 0 && (
        <section
          className={`rounded-xl border border-teal-200/90 bg-gradient-to-br from-teal-50/70 to-white ${pad}`}
          aria-label="מסקנות קליניות"
        >
          <h4 className="text-xs font-black text-teal-950 flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-4 h-4 text-teal-700 shrink-0" aria-hidden />
            מסקנות קליניות
          </h4>
          <BulletList items={insights.clinicalConclusions} bulletClass="text-teal-600" />
        </section>
      )}


      {insights.supplementalNarrative.length > 0 && (
        <section className={`rounded-xl border border-slate-100 bg-white ${pad}`}>
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
            פרטים נוספים
          </h4>
          <BulletList items={insights.supplementalNarrative} />
        </section>
      )}
    </div>
  );
}
