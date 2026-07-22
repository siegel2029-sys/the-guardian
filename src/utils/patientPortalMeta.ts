import type { BodyArea, Patient } from '../types';
import { bodyAreaLabels, getMuscleGroupLabel } from '../types';
import { addClinicalDays, getClinicalDate } from './clinicalCalendar';
import { resolvePatientRosterStatus } from './patientRosterMetrics';

export type PatientLastVisitLabel = {
  text: string;
  visitedToday: boolean;
  /** Whole clinical days since last portal open; `null` if never visited. */
  daysSinceVisit: number | null;
};

export type PatientLastVisitTone = 'today' | 'neutral' | 'stale';

export function patientLastVisitTone(label: PatientLastVisitLabel): PatientLastVisitTone {
  if (label.visitedToday) return 'today';
  if (label.daysSinceVisit != null && label.daysSinceVisit > 5) {
    return 'stale';
  }
  return 'neutral';
}

export type PatientLastVisitValuePart = { text: string; className?: string };

/** Styled segments for the dynamic value after "ביקור אחרון:" / "כניסה אחרונה:" (prefix stays neutral). */
export function patientLastVisitValueParts(label: PatientLastVisitLabel): PatientLastVisitValuePart[] {
  const tone = patientLastVisitTone(label);
  if (tone === 'today') {
    return [{ text: label.text, className: 'text-emerald-600 font-bold' }];
  }
  if (tone === 'stale') {
    const match = label.text.match(/^לפני (\d+) ימים$/);
    if (match) {
      return [
        { text: 'לפני ' },
        { text: match[1], className: 'text-red-600 font-bold' },
        { text: ' ימים' },
      ];
    }
    return [{ text: label.text, className: 'text-red-600 font-bold' }];
  }
  return [{ text: label.text, className: 'text-slate-700 font-medium' }];
}

/** Latest clinical day with a logged session or pain report (ignores stale portal timestamps). */
export function getLatestPatientClinicalActivityDay(patient: Patient): string | null {
  const dayKeys: string[] = [];

  for (const s of patient.analytics?.sessionHistory ?? []) {
    const d = s.date?.slice(0, 10);
    if (d) dayKeys.push(d);
  }
  for (const r of patient.analytics?.painHistory ?? []) {
    const d = r.date?.slice(0, 10);
    if (d) dayKeys.push(d);
  }
  if (patient.lastSessionDate?.trim()) {
    dayKeys.push(patient.lastSessionDate.slice(0, 10));
  }

  if (dayKeys.length === 0) return null;
  return dayKeys.sort((a, b) => b.localeCompare(a))[0];
}

function formatClinicalDayAsLastVisit(visitDay: string, clinicalToday: string): PatientLastVisitLabel {
  const daysSinceVisit = clinicalDaysBetween(visitDay, clinicalToday);

  if (visitDay === clinicalToday) {
    return { text: 'ביקר היום', visitedToday: true, daysSinceVisit: 0 };
  }
  const yesterday = addClinicalDays(clinicalToday, -1);
  if (visitDay === yesterday) {
    return { text: 'אתמול', visitedToday: false, daysSinceVisit: 1 };
  }
  const twoDaysAgo = addClinicalDays(clinicalToday, -2);
  if (visitDay === twoDaysAgo) {
    return { text: 'לפני יומיים', visitedToday: false, daysSinceVisit: 2 };
  }

  if (daysSinceVisit > 2 && daysSinceVisit <= 7) {
    return {
      text: `לפני ${daysSinceVisit} ימים`,
      visitedToday: false,
      daysSinceVisit,
    };
  }

  const [y, m, d] = visitDay.split('-').map((x) => parseInt(x, 10));
  const parsed = new Date(y, m - 1, d);
  return {
    text: parsed.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }),
    visitedToday: false,
    daysSinceVisit,
  };
}

/** Last-visit label derived from session/pain history — same source as absence detection. */
export function formatPatientLastClinicalActivityHe(
  patient: Patient,
  clinicalToday: string
): PatientLastVisitLabel {
  const latestDay = getLatestPatientClinicalActivityDay(patient);
  if (!latestDay) {
    return { text: 'טרם ביקר', visitedToday: false, daysSinceVisit: null };
  }
  return formatClinicalDayAsLastVisit(latestDay, clinicalToday);
}

/** Clinical day (04:00 rollover) for an ISO timestamp. */
export function clinicalDayFromIso(iso: string): string {
  return getClinicalDate(new Date(iso));
}

/** Newest portal login or workout timestamp — used for therapist "last active" display. */
export function getPatientLastPortalActivityIso(p: Patient): string | null {
  const login = p.lastLoginAt?.trim();
  const workout = p.lastWorkoutAt?.trim();
  if (!login && !workout) return null;
  if (!login) return workout!;
  if (!workout) return login;
  return new Date(login).getTime() >= new Date(workout).getTime() ? login : workout;
}

function clinicalDaysBetween(earlierYmd: string, laterYmd: string): number {
  const diffMs =
    clinicalDateToMidnight(laterYmd).getTime() - clinicalDateToMidnight(earlierYmd).getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

/** Hebrew date for profile sidebar "אימון אחרון:" — uses `payload.lastWorkoutAt`. */
export function formatPatientLastWorkoutHe(p: Patient): string {
  const iso =
    p.lastWorkoutAt ??
    (p.lastSessionDate?.trim() ? `${p.lastSessionDate.slice(0, 10)}T12:00:00.000Z` : null);
  if (!iso) return 'טרם התאמן';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'לא ידוע';
  return parsed.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatPatientLastVisitHe(
  iso: string | null | undefined,
  clinicalToday: string
): PatientLastVisitLabel {
  if (!iso?.trim()) {
    return { text: 'טרם ביקר', visitedToday: false, daysSinceVisit: null };
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { text: 'לא ידוע', visitedToday: false, daysSinceVisit: null };
  }

  const visitDay = clinicalDayFromIso(iso);
  return formatClinicalDayAsLastVisit(visitDay, clinicalToday);
}

function clinicalDateToMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export type PatientPushRegistrationStatus = {
  registered: boolean;
  keysVerified: boolean;
};

export function getPatientPushRegistrationStatus(p: Patient): PatientPushRegistrationStatus {
  const token = (p.pushToken ?? '').trim();
  const endpoint = (p.webPushSubscription?.endpoint ?? '').trim();
  const p256 = (p.webPushSubscription?.keys?.p256dh ?? '').trim();
  const auth = (p.webPushSubscription?.keys?.auth ?? '').trim();

  const registered = token.length > 0 || endpoint.length > 0;
  const keysVerified = p256.length > 0 && auth.length > 0;

  return { registered, keysVerified: registered && keysVerified };
}

/** Status pill on roster cards — omit default "active"; show restrictions only.
 * Incomplete intake is NOT a roster status — it is surfaced in the intake UI. */
export function patientRosterStatusBadge(
  p: Patient
): { label: string; className: string } | null {
  if (p.accountFrozen) {
    return {
      label: 'מוקפא',
      className: 'bg-sky-50 text-sky-900 border-sky-200',
    };
  }
  const status = resolvePatientRosterStatus(p);
  if (status === 'paused' || status === 'frozen') {
    return {
      label: 'מוקפא',
      className: 'bg-violet-50 text-violet-900 border-violet-200',
    };
  }
  if (status === 'pending') {
    return {
      label: 'ממתין',
      className: 'bg-amber-50 text-amber-900 border-amber-200',
    };
  }
  return null;
}

/**
 * Primary clinical targets from the therapist pain map (red highlights).
 * Does not include `secondaryClinicalBodyAreas` (orange annotations).
 */
export function getPatientPrimaryClinicalBodyAreas(p: Patient): BodyArea[] {
  const red = p.injuryHighlightSegments ?? [];
  if (red.length > 0) {
    return [...new Set(red)];
  }
  return p.primaryBodyArea ? [p.primaryBodyArea] : [];
}

/** Extra Hebrew / English tokens for roster search (e.g. "גב" → back segments). */
const BODY_AREA_SEARCH_ALIASES: Partial<Record<BodyArea, string[]>> = {
  neck: ['צוואר'],
  back_upper: ['גב', 'גו עליון', 'upper back'],
  back_lower: ['גב', 'גו תחתון', 'מותן', 'lower back'],
  chest: ['חזה', 'גו עליון'],
  abdomen: ['בטן', 'גו תחתון'],
  shoulder_right: ['כתף'],
  shoulder_left: ['כתף'],
  knee_right: ['ברך'],
  knee_left: ['ברך'],
  hip_right: ['אגן', 'עכוז'],
  hip_left: ['אגן', 'עכוז'],
  thigh_right: ['ירך'],
  thigh_left: ['ירך'],
  ankle_right: ['קרסול'],
  ankle_left: ['קרסול'],
  foot_right: ['כף רגל'],
  foot_left: ['כף רגל'],
  elbow_right: ['מרפק'],
  elbow_left: ['מרפק'],
  wrist_right: ['פרק יד'],
  wrist_left: ['פרק יד'],
  hand_right: ['כף יד'],
  hand_left: ['כף יד'],
};

function primaryClinicalAreaSearchTokens(p: Patient): string[] {
  const tokens = new Set<string>();
  for (const area of getPatientPrimaryClinicalBodyAreas(p)) {
    tokens.add(area.toLowerCase());
    tokens.add(bodyAreaLabels[area].toLowerCase());
    tokens.add(getMuscleGroupLabel(area).toLowerCase());
    for (const alias of BODY_AREA_SEARCH_ALIASES[area] ?? []) {
      tokens.add(alias.toLowerCase());
    }
    for (const part of area.split('_')) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  return [...tokens];
}

/** Match roster search by display name or primary (red-map) clinical body area. */
export function patientMatchesRosterSearch(p: Patient, queryRaw: string, displayName: string): boolean {
  const q = queryRaw.trim().toLowerCase();
  if (!q) return true;
  if (displayName.toLowerCase().includes(q)) return true;
  return primaryClinicalAreaSearchTokens(p).some((token) => token.includes(q));
}
