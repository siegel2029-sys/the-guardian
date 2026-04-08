import type { EquippedGearSnapshot } from '../config/gearCatalog';
import type { PatientGearPersistedV1 } from '../context/patientPersistence';

export function buildEquippedGearSnapshot(g: PatientGearPersistedV1): EquippedGearSnapshot {
  return {
    skin: g.equippedSkin,
    aura: g.equippedAura,
    hands: g.equippedHands,
    torso: g.equippedTorso,
    chest: g.equippedChestEmblem ?? null,
    feet: g.equippedFeetFx ?? null,
    cape: g.equippedCape ?? null,
  };
}
