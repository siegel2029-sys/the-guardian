import { describe, expect, it } from 'vitest';
import { RPC_DEFINER_REVIEW } from './rpcDefinerReview';
import {
  canonicalizeAccountControl,
  mergeAccountControlForUpsert,
} from './patientPayloadMerge';
import { patientPayloadBlocksAutomatedReminders } from './reminderDispatchLogic';

describe('RPC DEFINER review contract', () => {
  it('documents intentional authenticated EXECUTE for portal RPCs', () => {
    expect(RPC_DEFINER_REVIEW.complete_exercise_safe.intentionalDefiner).toBe(true);
    expect(RPC_DEFINER_REVIEW.complete_exercise_safe.anonExecute).toBe(false);
    expect(RPC_DEFINER_REVIEW.link_patient_auth_user.intentionalDefiner).toBe(true);
    expect(RPC_DEFINER_REVIEW.link_patient_auth_user.anonExecute).toBe(false);
  });
});

describe('freeze → denorm column contract (payload mirror)', () => {
  it('canonical sticky freeze sets status frozen for server column backfill', () => {
    const frozen = canonicalizeAccountControl(true, 'active');
    expect(frozen.accountFrozen).toBe(true);
    expect(frozen.status).toBe('frozen');
    expect(
      patientPayloadBlocksAutomatedReminders({
        id: 'p1',
        accountFrozen: frozen.accountFrozen,
        status: frozen.status,
      }),
    ).toBe(true);
  });

  it('mergeAccountControlForUpsert keeps sticky freeze when incoming tries to thaw without trust', () => {
    const merged = mergeAccountControlForUpsert(
      { accountFrozen: true, status: 'frozen' },
      { accountFrozen: false, status: 'active' },
      { trustIncomingAccountControl: false },
    );
    expect(merged.accountFrozen).toBe(true);
    expect(merged.status).toBe('frozen');
    expect(
      patientPayloadBlocksAutomatedReminders({
        id: 'p1',
        accountFrozen: merged.accountFrozen,
        status: merged.status,
      }),
    ).toBe(true);
  });
});
