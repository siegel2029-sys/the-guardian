import { useState } from 'react';
import { ShoppingBag, Shield } from 'lucide-react';
import { GEAR_CATALOG } from '../../config/gearCatalog';
import type { GearPurchaseResult, GearEquipSlot } from '../../context/PatientContext';
import type { PatientGearPersistedV1 } from '../../context/patientPersistence';

type PatientGearState = PatientGearPersistedV1;

type Props = {
  patientId: string;
  coins: number;
  gear: PatientGearState;
  purchaseGearItem: (patientId: string, itemId: string) => GearPurchaseResult;
  equipGearItem: (patientId: string, itemId: string) => boolean;
  unequipGearSlot: (patientId: string, slot: GearEquipSlot) => void;
};

function slotLabel(slot: GearEquipSlot): string {
  switch (slot) {
    case 'skin':
      return 'עור';
    case 'aura':
      return 'הילה';
    case 'hands':
      return 'ידיים';
    case 'torso':
      return 'מגן גוף';
    default:
      return slot;
  }
}

export default function GearStoreSection({
  patientId,
  coins,
  gear,
  purchaseGearItem,
  equipGearItem,
  unequipGearSlot,
}: Props) {
  const [msg, setMsg] = useState<string | null>(null);

  const showFlash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 2800);
  };

  const equippedInSlot = (slot: GearEquipSlot): string | null => {
    if (slot === 'skin') return gear.equippedSkin;
    if (slot === 'aura') return gear.equippedAura;
    if (slot === 'hands') return gear.equippedHands;
    return gear.equippedTorso;
  };

  return (
    <section
      className="mb-6 rounded-2xl border overflow-hidden"
      style={{ borderColor: '#c4b5fd', background: 'linear-gradient(180deg, #faf5ff 0%, #ffffff 55%)' }}
      dir="rtl"
    >
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#e9d5ff' }}>
        <ShoppingBag className="w-5 h-5 text-violet-700" />
        <h2 className="text-base font-bold text-slate-900">חנות הציוד</h2>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          השתמשו במטבעות מהתרגול והלמידה. פריטים ויזואליים מופיעים על האווטאר; מגן הרצף נצרך אוטומטית כשמפספסים
          יום קליני אחד (במקום לאפס את הרצף).
        </p>
        <div
          className="flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2 border"
          style={{ borderColor: '#ddd6fe', background: 'rgba(139, 92, 246, 0.06)' }}
        >
          <Shield className="w-4 h-4 text-violet-600 shrink-0" />
          <span>
            מגן רצף זמין: <strong className="tabular-nums">{gear.streakShieldCharges}</strong>
          </span>
        </div>
        {msg && (
          <p className="text-xs font-medium text-violet-900 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
            {msg}
          </p>
        )}
        <ul className="space-y-2">
          {GEAR_CATALOG.map((item) => {
            const owned = item.id === 'streak_shield' ? false : gear.ownedGearIds.includes(item.id);
            const affordable = coins >= item.priceCoins;
            const slot = item.equipSlot;
            const isVisual = item.kind === 'visual' && slot !== 'none';
            const equippedId = isVisual ? equippedInSlot(slot as GearEquipSlot) : null;
            const isEquipped = equippedId === item.id;

            return (
              <li
                key={item.id}
                className="rounded-xl border px-3 py-3 flex flex-col gap-2"
                style={{ borderColor: '#e9d5ff', background: 'rgba(255,255,255,0.92)' }}
              >
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.nameHe}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.descriptionHe}</p>
                    <p className="text-[10px] text-violet-700 font-bold mt-1 tabular-nums">
                      {item.priceCoins} מטבעות
                      {item.id === 'streak_shield' && ' · ניתן לרכוש מספר פעמים'}
                    </p>
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0"
                    style={{
                      background: item.kind === 'functional' ? '#fef3c7' : '#e0e7ff',
                      color: item.kind === 'functional' ? '#92400e' : '#3730a3',
                    }}
                  >
                    {item.kind === 'functional' ? 'פונקציונלי' : 'ויזואלי'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.id === 'streak_shield' ? (
                    <button
                      type="button"
                      disabled={!affordable}
                      onClick={() => {
                        const r = purchaseGearItem(patientId, item.id);
                        if (r === 'ok') showFlash('נרכש מגן רצף — נטען לשימוש אוטומטי כשצריך.');
                        else if (r === 'insufficient') showFlash('אין מספיק מטבעות.');
                        else showFlash('לא ניתן לרכוש כרגע.');
                      }}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' }}
                    >
                      קנה
                    </button>
                  ) : !owned ? (
                    <button
                      type="button"
                      disabled={!affordable}
                      onClick={() => {
                        const r = purchaseGearItem(patientId, item.id);
                        if (r === 'ok') showFlash('נרכש בהצלחה! אפשר לענוד מהרשימה.');
                        else if (r === 'already_owned') showFlash('כבר בבעלותך.');
                        else if (r === 'insufficient') showFlash('אין מספיק מטבעות.');
                        else showFlash('לא ניתן לרכוש.');
                      }}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' }}
                    >
                      קנה
                    </button>
                  ) : (
                    <>
                      {!isEquipped ? (
                        <button
                          type="button"
                          onClick={() => {
                            const ok = equipGearItem(patientId, item.id);
                            showFlash(ok ? 'הורכב על האווטאר.' : 'לא ניתן לענוד.');
                          }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border border-violet-300 text-violet-900 bg-white"
                        >
                          ענוד ({slotLabel(slot as GearEquipSlot)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            unequipGearSlot(patientId, slot as GearEquipSlot);
                            showFlash('הוסר מהאווטאר.');
                          }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-slate-50"
                        >
                          הסר
                        </button>
                      )}
                      <span className="text-[10px] font-semibold text-emerald-700 self-center">בבעלותך</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
