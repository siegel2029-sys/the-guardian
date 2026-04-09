import { useEffect, useState } from 'react';
import BodyMap3D from '../body-map/BodyMap3D';
import type { BodyMap3DProps } from '../body-map/BodyMap3D';
import { EMPTY_EQUIPPED_GEAR } from '../../config/gearCatalog';
import GordyCelebration from './GordyCelebration';

type Props = BodyMap3DProps & {
  patientId: string;
  /** מזהה פרס אחרון — מפעיל קונפטי כשמשתנה */
  celebrationBurstKey?: number;
};

/**
 * גורדי — אווטאר עם גלימה, הילה זהב, סיבוב הצגה וברכה חד־פעמית לסשן.
 */
export default function GordyHero({ patientId, celebrationBurstKey = 0, equippedGear, ...rest }: Props) {
  const mergedGear = {
    ...EMPTY_EQUIPPED_GEAR,
    ...equippedGear,
    skin: 'gold_skin',
    aura: equippedGear?.aura ?? 'aura_teal',
    cape: 'clinical_cape',
  };
  const [spinDone, setSpinDone] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const key = `gordy_welcome_${patientId}`;
    setShowWelcome(sessionStorage.getItem(key) !== '1');
    const t = window.setTimeout(() => setSpinDone(true), 2100);
    return () => clearTimeout(t);
  }, [patientId]);

  const dismissWelcome = () => {
    sessionStorage.setItem(`gordy_welcome_${patientId}`, '1');
    setShowWelcome(false);
  };

  return (
    <div className="relative w-full h-full min-h-[inherit]">
      {showWelcome && (
        <div
          className="absolute top-2 left-2 right-2 z-20 rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-50 to-white px-3 py-2 shadow-lg animate-gordy-welcome-in"
          role="status"
        >
          <p className="text-xs font-bold text-amber-950 text-center leading-snug">
            ברוך הבא! אני גורדי, המלווה שלך.
          </p>
          <button
            type="button"
            className="mt-1 w-full text-[10px] font-semibold text-amber-800/80 hover:text-amber-950"
            onClick={dismissWelcome}
          >
            סגירה
          </button>
        </div>
      )}

      <div
        className={`relative w-full h-full ${spinDone ? '' : 'gordy-hero-spin-stage'}`}
        style={{ perspective: '920px' }}
      >
        <div className={`w-full h-full ${spinDone ? '' : 'gordy-hero-spin-inner'}`}>
          <BodyMap3D {...rest} equippedGear={mergedGear} />
        </div>
        <GordyCelebration burstKey={celebrationBurstKey} />
      </div>
    </div>
  );
}
