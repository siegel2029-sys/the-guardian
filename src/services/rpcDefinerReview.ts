/**
 * RPC DEFINER authorization review (production readiness).
 *
 * Verified against migrations:
 * - complete_exercise_safe: resolves patient via patients.auth_user_id = auth.uid();
 *   raises 42501 when unlinked; only mutates caller’s active plan exercise status.
 *   EXECUTE: authenticated + service_role (anon revoked — phase3).
 * - link_patient_auth_user: requires JWT app_metadata.patient_id === p_patient_id
 *   (no user_metadata fallback); updates auth_user_id only when null or already self.
 *   EXECUTE: authenticated + service_role (anon revoked — phase3).
 *
 * Advisor WARN “authenticated can execute SECURITY DEFINER” is intentional for these
 * two portal RPCs; authorization is enforced inside the function body + search_path pinned.
 */
export const RPC_DEFINER_REVIEW = {
  complete_exercise_safe: {
    intentionalDefiner: true,
    authModel: 'patients.auth_user_id = auth.uid()',
    anonExecute: false,
  },
  link_patient_auth_user: {
    intentionalDefiner: true,
    authModel:
      'Idempotent if patients.auth_user_id = auth.uid(); else claim from auth.users app_metadata (promoted from user_metadata). Soft JSON fail — no RAISE 42501.',
    anonExecute: false,
  },
} as const;
