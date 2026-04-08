import { useState, type ReactNode } from 'react';
import { ShoppingBag, Shield, Sparkles, Swords } from 'lucide-react';
import { GEAR_CATALOG, type GearCatalogEntry, type GearEquipSlot } from '../../config/gearCatalog';
import type { GearPurchaseResult } from '../../context/PatientContext';
import type { PatientGearPersistedV1 } from '../../context/patientPersistence';
import GearItemPreviewCanvas, { gearItemPreviewSupported } from './gear/GearItemPreviewCanvas';

type PatientGearState = PatientGearPersistedV1;

type Props = {
  patientId: string;
  coins: number;
  patientXp: number;
  gear: PatientGearState;
  purchaseGearItem: (patientId: string, itemId: string) => GearPurchaseResult;
  equipGearItem: (patientId: string, itemId: string) => boolean;
  unequipGearSlot: (patientId: string, slot: GearEquipSlot) => void;
};

function slotLabelHe(slot: GearEquipSlot): string {
  switch (slot) {
    case 'skin':
      return 'עור';
    case 'aura':
      return 'הילה';
    case 'hands':
      return 'ידיים';
    case 'torso':
      return 'מגן';
    case 'chest':
      return 'חזה';
    case 'feet':
      return 'רגליים';
    case 'cape':
      return 'גקליניקה';
    case 'functional_passive':
      return 'מגבר';
    default:
      return '—';
  }
}

function equippedInSlot(gear: PatientGearState, slot: GearEquipSlot): string | null {
  switch (slot) {
    case 'skin':
      return gear.equippedSkin;
    case 'aura':
      return gear.equippedAura;
    case 'hands':
      return gear.equippedHands;
    case 'torso':
      return gear.equippedTorso;
    case 'chest':
      return gear.equippedChestEmblem;
    case 'feet':
      return gear.equippedFeetFx;
    case 'cape':
      return gear.equippedCape;
    case 'functional_passive':
      return gear.equippedPassiveId;
    default:
      return null;
  }
}

const tierTitle: Record<GearCatalogEntry['tier'], string> = {
  low: 'ציוד בסיסי',
  functional: 'פונקציונלי',
  elite: 'אליטה קלינית',
};

const tierCardClass: Record<GearCatalogEntry['tier'], string> = {
  low: 'border-slate-600/90 shadow-md shadow-black/40',
  functional:
    'border-amber-500/45 shadow-[0_0_14px_rgba(245,158,11,0.22)] shadow-black/30',
  elite:
    'border-cyan-400/55 shadow-[0_0_20px_rgba(34,211,238,0.28)] shadow-black/40',
};

function TierSection({
  tier,
  items,
  children,
}: {
  tier: GearCatalogEntry['tier'];
  items: GearCatalogEntry[];
  children: ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        {tier === 'elite' ? (
          <Sparkles className="w-4 h-4 text-cyan-300" />
        ) : tier === 'functional' ? (
          <Swords className="w-4 h-4 text-amber-400" />
        ) : (
          <Shield className="w-4 h-4 text-slate-400" />
        )}
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">{tierTitle[tier]}</h3>
      </div>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

export default function GearStoreArmory({
  patientId,
  coins,
  patientXp,
  gear,
  purchaseGearItem,
  equipGearItem,
  unequipGearSlot,
}: Props) {
  const [msg, setMsg] = useState<string | null>(null);

  const showFlash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 3200);
  };

  const low = GEAR_CATALOG.filter((i) => i.tier === 'low');
  const functional = GEAR_CATALOG.filter((i) => i.tier === 'functional');
  const elite = GEAR_CATALOG.filter((i) => i.tier === 'elite');

  const renderCard = (item: GearCatalogEntry) => {
    const isStreak = item.id === 'streak_shield';
    const owned = isStreak ? false : gear.ownedGearIds.includes(item.id);
    const affordableCoins = coins >= item.priceCoins;
    const meetsXp = patientXp >= item.xpRequired;
    const canBuy = affordableCoins && meetsXp;
    const slot = item.equipSlot;
    const isEquippable = item.kind === 'visual' && slot !== 'none';
    const equippedId = isEquippable || slot === 'functional_passive' ? equippedInSlot(gear, slot) : null;
    const isEquipped = equippedId === item.id;

    return (
      <li
        key={item.id}
        className={`rounded-xl border px-3 py-3 flex flex-col gap-2.5 transition-transform duration-200 hover:scale-[1.02] hover:z-[1] ${tierCardClass[item.tier]}`}
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.88))',
        }}
      >
        <div className="flex gap-2.5">
          <div className="w-[min(100%,7.5rem)] shrink-0">
            {gearItemPreviewSupported(item.id) ? (
              <GearItemPreviewCanvas itemId={item.id} />
            ) : (
              <div
                className="h-[88px] rounded-lg border border-slate-600 flex items-center justify-center bg-slate-900/90"
                style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.45)' }}
              >
                <Shield className="w-8 h-8 text-amber-500/80" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-1.5">
              <p className="text-sm font-bold text-slate-100 leading-tight">{item.nameHe}</p>
              {isEquipped && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                  מעוצב
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">{item.descriptionHe}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] font-bold tabular-nums">
              <span className="text-amber-300/95">{item.priceCoins} מטבעות</span>
              <span className={meetsXp ? 'text-cyan-300/90' : 'text-rose-400'}>
                דרישת XP: {item.xpRequired}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-0.5">
          {isStreak ? (
            <button
              type="button"
              disabled={!canBuy}
              onClick={() => {
                const r = purchaseGearItem(patientId, item.id);
                if (r === 'ok') showFlash('נרכש מגן רצף.');
                else if (r === 'insufficient') showFlash('אין מספיק מטבעות.');
                else if (r === 'insufficient_xp') showFlash('חסר XP לרכישה.');
                else showFlash('לא ניתן לרכוש.');
              }}
              className="text-xs font-bold px-3 py-2 rounded-lg text-white disabled:opacity-35 disabled:cursor-not-allowed bg-gradient-to-r from-amber-700 to-orange-700 border border-amber-500/40"
            >
              קנה
            </button>
          ) : !owned ? (
            <button
              type="button"
              disabled={!canBuy}
              onClick={() => {
                const r = purchaseGearItem(patientId, item.id);
                if (r === 'ok') showFlash('נרכש! אפשר לענוד.');
                else if (r === 'already_owned') showFlash('כבר בבעלותך.');
                else if (r === 'insufficient') showFlash('אין מספיק מטבעות.');
                else if (r === 'insufficient_xp') showFlash('חסר XP לרכישה.');
                else showFlash('לא ניתן לרכוש.');
              }}
              className="text-xs font-bold px-3 py-2 rounded-lg text-white disabled:opacity-35 disabled:cursor-not-allowed bg-gradient-to-r from-violet-700 to-indigo-800 border border-violet-400/30"
            >
              קנה
            </button>
          ) : (
            <>
              {slot !== 'none' && (
                <>
                  {!isEquipped ? (
                    <button
                      type="button"
                      onClick={() => {
                        const ok = equipGearItem(patientId, item.id);
                        showFlash(ok ? 'הורכב על האווטאר.' : 'לא ניתן לענוד.');
                      }}
                      className="text-xs font-bold px-3 py-2 rounded-lg border border-cyan-500/50 text-cyan-200 bg-slate-800/80 hover:bg-slate-700/90"
                    >
                      ענוד ({slotLabelHe(slot)})
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        unequipGearSlot(patientId, slot);
                        showFlash('הוסר מהאווטאר.');
                      }}
                      className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-500 text-slate-300 bg-slate-800/60"
                    >
                      הסר
                    </button>
                  )}
                </>
              )}
              <span className="text-[10px] font-semibold text-emerald-400/90 self-center">בבעלותך</span>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <section
      className="mb-6 rounded-2xl border overflow-hidden"
      style={{
        borderColor: 'rgba(51,65,85,0.85)',
        background: 'linear-gradient(180deg, #0f172a 0%, #020617 55%)',
        boxShadow: '0 0 40px rgba(8,145,178,0.08), inset 0 1px 0 rgba(148,163,184,0.12)',
      }}
      dir="rtl"
    >
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: 'rgba(51,65,85,0.9)', background: 'rgba(15,23,42,0.6)' }}
      >
        <ShoppingBag className="w-5 h-5 text-cyan-400" />
        <h2 className="text-base font-black text-slate-100 tracking-tight">נשקייה קלינית</h2>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          תצוגה מקדימה תלת־ממדית, מחיר במטבעות ודרישת XP. פריטים מסומנים כמעוצבים מופיעים על האווטאר באזור
          האנטומי המתאים.
        </p>
        <div
          className="flex items-center gap-2 text-[11px] font-semibold rounded-xl px-3 py-2 border mb-4"
          style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(120,53,15,0.2)' }}
        >
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-amber-100/95">
            מגן רצף זמין: <strong className="tabular-nums">{gear.streakShieldCharges}</strong>
          </span>
        </div>
        {msg && (
          <p className="text-xs font-medium text-cyan-100 bg-cyan-950/60 border border-cyan-700/40 rounded-xl px-3 py-2 mb-3">
            {msg}
          </p>
        )}
        <TierSection tier="low" items={low}>
          {low.map((item) => renderCard(item))}
        </TierSection>
        <TierSection tier="functional" items={functional}>
          {functional.map((item) => renderCard(item))}
        </TierSection>
        <TierSection tier="elite" items={elite}>
          {elite.map((item) => renderCard(item))}
        </TierSection>
      </div>
    </section>
  );
}
