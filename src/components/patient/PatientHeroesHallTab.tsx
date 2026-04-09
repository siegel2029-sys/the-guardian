import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import BodyMap3D from '../body-map/BodyMap3D';
import type { BodyArea } from '../../types';
import { FICTIONAL_HEROES_HALL } from '../../data/fictionalHeroesHall';

/**
 * היכל הגיבורים — גלריית דמויות בדיוניות בלבד (פורטל מטופל).
 */
export default function PatientHeroesHallTab() {
  const [openId, setOpenId] = useState<string | null>(FICTIONAL_HEROES_HALL[0]?.id ?? null);

  return (
    <div className="space-y-4 pb-28" dir="rtl">
      <header
        className="rounded-2xl border p-4"
        style={{
          borderColor: '#c4b5fd',
          background: 'linear-gradient(135deg, #f5f3ff, #ffffff)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
          <h1 className="text-lg font-black text-violet-950">היכל הגיבורים</h1>
        </div>
        <p className="text-xs text-violet-900/85 leading-relaxed">
          דמויות השראה בדיוניות בלבד — אין השוואה אישית ואין חשיפת נתוני מטופלים אמיתיים. כל גיבור ממחיש
          אפשרות ויזואלית של התקדמות, ציוד מהחנות והתמדה.
        </p>
        <p className="text-[10px] text-violet-800/70 mt-2 font-medium">קטגוריה: השראה חברתית</p>
      </header>

      <ul className="space-y-3">
        {FICTIONAL_HEROES_HALL.map((hero) => {
          const open = openId === hero.id;
          const emptyPain = {} as Partial<Record<BodyArea, number>>;
          return (
            <li
              key={hero.id}
              className="rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: '#ddd6fe', background: '#fafaff' }}
            >
              <button
                type="button"
                onClick={() => setOpenId((id) => (id === hero.id ? null : hero.id))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start hover:bg-violet-50/80 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-violet-950 truncate">{hero.nameHe}</p>
                  <p className="text-[11px] text-violet-800/80">רמה {hero.level} · רצף {hero.streak} ימים</p>
                </div>
                <span
                  className="shrink-0 px-2.5 py-1 rounded-xl text-[10px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}
                >
                  L{hero.level}
                </span>
                {open ? (
                  <ChevronUp className="w-5 h-5 text-violet-600 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-violet-600 shrink-0" />
                )}
              </button>
              {open && (
                <div className="px-3 pb-4 pt-1 border-t border-violet-100 space-y-3">
                  <p className="text-sm text-slate-700 leading-relaxed px-1 italic">«{hero.quoteHe}»</p>
                  <div
                    className="rounded-xl border overflow-hidden mx-auto w-full"
                    style={{ borderColor: '#e9d5ff', maxWidth: 380, aspectRatio: '9 / 14', minHeight: 420 }}
                  >
                    <BodyMap3D
                      activeAreas={hero.activeAreas}
                      primaryArea={hero.primaryArea}
                      clinicalArea={hero.clinicalArea}
                      painByArea={emptyPain}
                      level={hero.level}
                      xp={0}
                      xpForNextLevel={999_999_999}
                      streak={hero.streak}
                      injuryHighlightSegments={[]}
                      equippedGear={hero.equippedGear}
                      segmentGrowthMul={hero.segmentGrowthMul}
                      minHeightPx={400}
                      avatarScale={0.88}
                      floatingLevelBadge
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
