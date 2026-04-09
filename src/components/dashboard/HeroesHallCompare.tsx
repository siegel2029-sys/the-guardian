import BodyMap3D from '../body-map/BodyMap3D';
import type { BodyArea } from '../../types';

type HeroesHallCompareProps = {
  userLevel: number;
  userXp: number;
  userXpNext: number;
  activeAreas: BodyArea[];
  primaryArea?: BodyArea;
  /** רמות צמיחה מלאות לגיבור */
  heroLevel?: number;
};

/**
 * השוואה אנונימית: המטופל מול «גיבור» רמה מקסימלית — השראה ויזואלית.
 */
export default function HeroesHallCompare({
  userLevel,
  userXp,
  userXpNext,
  activeAreas,
  primaryArea,
  heroLevel = 100,
}: HeroesHallCompareProps) {
  const emptyPain = {} as Partial<Record<BodyArea, number>>;

  return (
    <section
      className="rounded-2xl border p-4 mb-5"
      style={{ borderColor: '#c4b5fd', background: 'linear-gradient(135deg, #f5f3ff, #ffffff)' }}
      dir="rtl"
    >
      <h2 className="text-sm font-black text-violet-950 mb-1">היכל הגיבורים (אנונימי)</h2>
      <p className="text-[11px] text-violet-900/80 mb-4 leading-relaxed">
        השוואה ויזואלית בלבד — הזהות שלך לא נחשפת. הגיבור מייצג התפתחות שריר מקסימלית לכל המקטעים.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold text-slate-600 mb-2 text-center">המטופל · רמה {userLevel}</p>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e0e7ff', minHeight: 280 }}>
            <BodyMap3D
              activeAreas={activeAreas}
              primaryArea={primaryArea}
              clinicalArea={primaryArea}
              painByArea={emptyPain}
              level={userLevel}
              xp={userXp}
              xpForNextLevel={userXpNext}
              streak={0}
              injuryHighlightSegments={[]}
              minHeightPx={260}
              avatarScale={0.82}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-violet-800 mb-2 text-center">
            גיבור · רמה {heroLevel} (מקס׳ התפתחות)
          </p>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#ddd6fe', minHeight: 280 }}>
            <BodyMap3D
              activeAreas={activeAreas}
              primaryArea={undefined}
              clinicalArea={undefined}
              painByArea={emptyPain}
              level={heroLevel}
              xp={0}
              xpForNextLevel={999_999_999}
              streak={7}
              injuryHighlightSegments={[]}
              minHeightPx={260}
              avatarScale={0.82}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
