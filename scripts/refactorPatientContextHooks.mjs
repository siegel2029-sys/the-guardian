import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../src/context/PatientContext.tsx');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const hookBlock = `  const gamification = useGamification({
    allPatients,
    setAllPatients,
    patientRewardMetaByPatientId,
    setPatientRewardMetaByPatientId,
    patientGearByPatientId,
    setPatientGearByPatientId,
    knowledgeFacts,
    setKnowledgeFacts,
  });

  const exercise = useExercisePlan({
    patients,
    allPatients,
    setAllPatients,
    exercisePlans,
    setExercisePlans,
    dailySessions,
    setDailySessions,
    clinicalTick,
    clinicalToday,
    aiSuggestions,
    setAiSuggestions,
    selfCareZonesByPatientId,
    setSelfCareZonesByPatientId,
    selfCareReportsByPatientId,
    setSelfCareReportsByPatientId,
    patientExerciseFinishReportsByPatientId,
    setPatientExerciseFinishReportsByPatientId,
    selfCareStrengthTierByPatientId,
    setSelfCareStrengthTierByPatientId,
    patientGearByPatientId,
    setPatientGearByPatientId,
    setExerciseSafetyLockedPatientIds,
    setSafetyAlerts,
    sendAiClinicalAlert,
    pushRewardFeedback: gamification.pushRewardFeedback,
    therapistScopeIds,
    setSelectedPatientId,
    setActiveSection,
  });

  const clinical = useClinicalData({
    allPatients,
    setAllPatients,
    setMessages,
    setSelfCareZonesByPatientId,
    exercisePlans,
    setAiSuggestions,
    clinicalToday,
  });
`.split('\n');

const iRed = lines.findIndex((l) => l.includes('// ── Red flags'));
if (iRed < 0) throw new Error('Red flags marker not found');

const iEnd = lines.findIndex(
  (l, i) =>
    i > iRed &&
    l.trim() === '[allPatients, exercisePlans, clinicalToday]' &&
    lines[i + 1]?.trim() === ');'
);
if (iEnd < 0) throw new Error('runClinicalAssessmentEngine deps end not found');

const endExclusive = iEnd + 2;

const out = [...lines.slice(0, iRed), ...hookBlock, ...lines.slice(endExclusive)];

fs.writeFileSync(file, out.join('\n') + '\n');
console.log('Replaced lines', iRed + 1, '-', endExclusive, 'with hooks');
