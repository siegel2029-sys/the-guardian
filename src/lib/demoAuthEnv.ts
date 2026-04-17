/**
 * Optional passwords for local legacy auth (VITE_USE_LEGACY_AUTH=true).
 * Never commit real values — set in `.env` only for local development.
 */
export function getDemoTherapistAPassword(): string {
  return String(import.meta.env.VITE_DEMO_THERAPIST_A_PASSWORD ?? '').trim();
}

export function getDemoTherapistBPassword(): string {
  return String(import.meta.env.VITE_DEMO_THERAPIST_B_PASSWORD ?? '').trim();
}

/** Default portal password seeded for auto-created PT-… accounts (legacy auth only). */
export function getDemoSeedPatientPortalPassword(): string {
  return String(import.meta.env.VITE_DEMO_SEED_PATIENT_PORTAL_PASSWORD ?? '').trim();
}
