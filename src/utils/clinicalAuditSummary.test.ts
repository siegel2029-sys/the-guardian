import { describe, expect, it } from 'vitest';
import { summarizeClinicalAuditLine } from './clinicalAuditSummary';

describe('summarizeClinicalAuditLine recommendation', () => {
  it('prefers summaryHebrew for patient_accept footprint', () => {
    const line = summarizeClinicalAuditLine(
      'recommendation',
      'patient_accept',
      { proposalId: 'p1', source: 'program_review_ai' },
      {
        summaryHebrew: 'ה-AI הציע שינוי תוכנית והמטופל אישר אותו בתאריך 2026-08-07 12:00',
        acceptedBy: 'patient',
      }
    );
    expect(line).toContain('המטופל אישר');
  });

  it('falls back for patient_decline without summary', () => {
    expect(
      summarizeClinicalAuditLine('recommendation', 'patient_decline', {}, {})
    ).toContain('דחה');
  });
});
