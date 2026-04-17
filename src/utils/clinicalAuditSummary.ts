import type { PatientExercise } from '../types';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function exerciseListFromPayload(v: unknown): PatientExercise[] {
  if (!isRecord(v)) return [];
  const ex = v['exercises'];
  return Array.isArray(ex) ? (ex as PatientExercise[]) : [];
}

const patientFieldLabels: Record<string, string> = {
  name: 'שם',
  diagnosis: 'אבחנה',
  status: 'סטטוס',
  therapistNotes: 'הערות מטפל',
  primaryBodyArea: 'אזור גוף',
  age: 'גיל',
  level: 'רמה',
  hasRedFlag: 'דגל אדום',
};

/**
 * Short Hebrew description for therapist-facing audit list (plan or patient_info payloads).
 */
export function summarizeClinicalAuditLine(
  entityType: string,
  action: string,
  oldValue: unknown,
  newValue: unknown
): string {
  if (entityType === 'plan') {
    return summarizePlanDiff(action, oldValue, newValue);
  }
  if (entityType === 'patient_info') {
    return summarizePatientInfoDiff(action, oldValue, newValue);
  }
  return action === 'create' ? 'רשומה חדשה' : 'עדכון';
}

function summarizePlanDiff(action: string, oldValue: unknown, newValue: unknown): string {
  const oldEx = exerciseListFromPayload(oldValue);
  const newEx = exerciseListFromPayload(newValue);
  if (action === 'create' || oldEx.length === 0) {
    return `תוכנית אימון נוצרה (${newEx.length} תרגילים)`;
  }

  const oldById = new Map(oldEx.map((e) => [e.id, e]));
  const parts: string[] = [];

  for (const n of newEx) {
    const o = oldById.get(n.id);
    if (!o) {
      parts.push(`נוסף «${n.name}»`);
      continue;
    }
    if (o.patientWeightKg !== n.patientWeightKg) {
      const from =
        o.patientWeightKg != null && o.patientWeightKg > 0 ? `${o.patientWeightKg}ק״ג` : 'ללא משקל';
      const to =
        n.patientWeightKg != null && n.patientWeightKg > 0 ? `${n.patientWeightKg}ק״ג` : 'ללא משקל';
      parts.push(`«${n.name}» מ־${from} ל־${to}`);
    }
    if (o.patientSets !== n.patientSets || o.patientReps !== n.patientReps) {
      parts.push(`«${n.name}»: ${o.patientSets}×${o.patientReps} → ${n.patientSets}×${n.patientReps}`);
    }
  }

  for (const o of oldEx) {
    if (!newEx.some((e) => e.id === o.id)) {
      parts.push(`הוסר «${o.name}»`);
    }
  }

  if (parts.length === 0) return 'עודכנה תוכנית אימון';
  return parts.slice(0, 6).join(' · ');
}

const patientWatchKeys = [
  'name',
  'diagnosis',
  'status',
  'therapistNotes',
  'primaryBodyArea',
  'age',
  'level',
  'hasRedFlag',
] as const;

function summarizePatientInfoDiff(action: string, oldValue: unknown, newValue: unknown): string {
  if (action === 'create' || oldValue == null) {
    return 'נוצרו/נשמרו פרטי מטופל';
  }
  const o = isRecord(oldValue) ? oldValue : null;
  const n = isRecord(newValue) ? newValue : null;
  if (!o || !n) return 'עודכנו פרטי מטופל';

  const keys = patientWatchKeys.filter(
    (k) => k in n && JSON.stringify(o[k]) !== JSON.stringify(n[k])
  );
  if (keys.length === 0) return 'עודכנו פרטי מטופל';

  const bits = keys
    .slice(0, 5)
    .map((k) => patientFieldLabels[k] ?? k)
    .join(', ');
  return `שינוי ב: ${bits}`;
}
