import type { GearEquipSlot } from '../config/gearCatalog';
import type { PatientGearPersistedV1 } from './patientPersistence';

export type PatientGearState = PatientGearPersistedV1;

export function defaultPatientGear(): PatientGearState {
  return {
    ownedGearIds: [],
    equippedSkin: null,
    equippedAura: null,
    equippedHands: null,
    equippedTorso: null,
    equippedChestEmblem: null,
    equippedFeetFx: null,
    equippedCape: null,
    equippedPassiveId: null,
    streakShieldCharges: 0,
  };
}

export function normalizePatientGear(v: Partial<PatientGearState> | undefined): PatientGearState {
  return {
    ownedGearIds: [...(v?.ownedGearIds ?? [])],
    equippedSkin: v?.equippedSkin ?? null,
    equippedAura: v?.equippedAura ?? null,
    equippedHands: v?.equippedHands ?? null,
    equippedTorso: v?.equippedTorso ?? null,
    equippedChestEmblem: v?.equippedChestEmblem ?? null,
    equippedFeetFx: v?.equippedFeetFx ?? null,
    equippedCape: v?.equippedCape ?? null,
    equippedPassiveId: v?.equippedPassiveId ?? null,
    streakShieldCharges: Math.max(0, v?.streakShieldCharges ?? 0),
  };
}

export function gearSlotToStateKey(slot: GearEquipSlot): keyof PatientGearState | null {
  switch (slot) {
    case 'skin':
      return 'equippedSkin';
    case 'aura':
      return 'equippedAura';
    case 'hands':
      return 'equippedHands';
    case 'torso':
      return 'equippedTorso';
    case 'chest':
      return 'equippedChestEmblem';
    case 'feet':
      return 'equippedFeetFx';
    case 'cape':
      return 'equippedCape';
    default:
      return null;
  }
}
