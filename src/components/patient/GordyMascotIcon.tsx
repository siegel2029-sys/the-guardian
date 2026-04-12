import { useEffect, useRef } from 'react';
import GordieCanvas from './GordieCanvas';
import type { GordieModelHandle } from './GordieModel';

export type GordyMood = 'default' | 'concerned' | 'joy' | 'thinking' | 'like';

type Props = {
  className?: string;
  mood?: GordyMood;
  /** Overrides mood-based clip selection when set. */
  animationName?: string;
  /** Increment (e.g. XP burst) to run in-scene scale celebration on the GLB. */
  celebrateBurstKey?: number;
  /**
   * When true, companion uses a calmer idle hint (same as concerned mood for clip pick).
   * Usually matches clinical / red-flag concern.
   */
  therapistMaterialAlert?: boolean;
};

const MOOD_ANIMATION: Record<GordyMood, string | undefined> = {
  default: undefined,
  concerned: 'Idle',
  joy: 'Wave',
  thinking: 'Thinking',
  like: 'Like',
};

/**
 * Gordie mascot in a compact responsive Canvas (rigged GLB). Prefer `animationName` for explicit clips
 * (`Wave`, `Exercise1`, …); `mood` supplies defaults when omitted.
 */
export default function GordyMascotIcon({
  className = 'w-8 h-8',
  mood = 'default',
  animationName: animationNameProp,
  celebrateBurstKey = 0,
  therapistMaterialAlert,
}: Props) {
  const gordyRef = useRef<GordieModelHandle>(null);
  const prevBurstRef = useRef(0);

  useEffect(() => {
    if (celebrateBurstKey > 0 && celebrateBurstKey !== prevBurstRef.current) {
      prevBurstRef.current = celebrateBurstKey;
      gordyRef.current?.celebrate();
    }
  }, [celebrateBurstKey]);

  const alertFromMood = mood === 'concerned';
  const therapistAlert = therapistMaterialAlert ?? alertFromMood;

  const moodAnim = therapistAlert ? MOOD_ANIMATION.concerned : MOOD_ANIMATION[mood];
  const animationName = animationNameProp ?? moodAnim;

  return (
    <GordieCanvas
      ref={gordyRef}
      className={className}
      variant="icon"
      animationName={animationName}
    />
  );
}
