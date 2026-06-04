import type { PatientClinicalIntakeProfile } from '../../../types';

/** פיצול שורות כוח שרירים לעריכה בטבלה */
export function parseStrengthRows(muscleStrength: string | undefined): { muscle: string; grade: string }[] {
  const raw = muscleStrength?.trim() ?? '';
  if (!raw) return [{ muscle: '', grade: '' }];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [{ muscle: '', grade: '' }];
  return lines.map((line) => {
    const m = line.match(/^(.+?)\s*[:–-]\s*(\d(?:\.\d)?)\s*$/);
    if (m) return { muscle: m[1].trim(), grade: m[2] };
    const tail = line.match(/(\d(?:\.\d)?)\s*$/);
    if (tail) {
      return { muscle: line.slice(0, tail.index).replace(/[:\s–-]+$/, '').trim(), grade: tail[1] };
    }
    return { muscle: line, grade: '' };
  });
}

export function formatStrengthRows(rows: { muscle: string; grade: string }[]): string {
  return rows
    .map((r) => {
      const m = r.muscle.trim();
      const g = r.grade.trim();
      if (!m && !g) return '';
      if (m && g) return `${m}: ${g}`;
      return m || g;
    })
    .filter(Boolean)
    .join('\n');
}

export function splitClinicalListText(text: string): string[] {
  return text
    .split(/\r?\n|[;،]|(?:\s*·\s*)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function emptyClinicalProfile(): PatientClinicalIntakeProfile {
  return {
    ranges: [],
    muscle_strength: '',
    medical_history: { backgroundDiseases: '', chronicMedications: '' },
    goals: [],
  };
}

export type RomTableRow = { movement: string; value: string; note: string };

export function parseRomRow(raw: string): RomTableRow {
  const pipe = raw.indexOf('|');
  const base = pipe >= 0 ? raw.slice(0, pipe).trim() : raw.trim();
  const note = pipe >= 0 ? raw.slice(pipe + 1).trim() : '';
  const colon = base.indexOf(':');
  if (colon >= 0) {
    return {
      movement: base.slice(0, colon).trim(),
      value: base.slice(colon + 1).trim(),
      note,
    };
  }
  return { movement: base, value: '', note };
}

export function formatRomRow(row: RomTableRow): string {
  const movement = row.movement.trim();
  const value = row.value.trim();
  const note = row.note.trim();
  let base = movement;
  if (movement && value) base = `${movement}: ${value}`;
  else if (value) base = value;
  return note ? `${base}|${note}` : base;
}
