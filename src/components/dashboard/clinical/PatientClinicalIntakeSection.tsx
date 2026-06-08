import type { Patient } from '../../../types';
import { loadLatestIntakeFields } from '../../../utils/clinicalIntakeVersions';
import { MedicalIntakeSectionedReport } from './MedicalIntakeDashboard';

type Props = {
  patient: Patient;
};

/** Read-only intake snapshot for the daily patient view — no versioning controls. */
export default function PatientClinicalIntakeSection({ patient }: Props) {
  const fields = loadLatestIntakeFields(patient);
  const noop = () => undefined;
  const noopList = () => undefined;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      aria-label="תמצית אינטייק קליני"
      dir="rtl"
    >
      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-sky-50/80 to-slate-50/80">
        <h3 className="text-sm font-black text-slate-900">תמצית אינטייק</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          לצפייה מלאה, עריכה וניתוח השוואתי — פתחו «סיכום אינטייק מלא».
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <MedicalIntakeSectionedReport
          readOnly
          showRedFlags
          showAiInsights={false}
          caseStory={fields.caseStory}
          onCaseStoryChange={noop}
          vasScore={fields.vasScore}
          onVasScoreChange={noop}
          clinicalDiagnosis={fields.diagnosis}
          onClinicalDiagnosisChange={noop}
          differentialDiagnosis={fields.differentialDiagnosis}
          onDifferentialChange={noopList}
          clinicalConclusionsHe={fields.clinicalConclusionsHe}
          onClinicalConclusionsChange={noopList}
          precautionsHe={fields.precautionsHe}
          onPrecautionsChange={noopList}
          recommendedTestsHe={fields.recommendedTestsHe}
          onRecommendedTestsChange={noopList}
          redFlags={fields.redFlags}
          profile={fields.clinicalIntakeProfile}
        />
      </div>
    </section>
  );
}
