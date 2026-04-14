import { useEffect, useRef } from 'react';
import GordieCanvas from './GordieCanvas';
import type { GuardieModelHandle } from './GordieModel';

export type GuardiMood = 'default' | 'concerned' | 'joy' | 'thinking' | 'like' | 'sad';

type Props = {
  className?: string;
  mood?: GuardiMood;
  /** Overrides mood-based clip selection when set. */
  animationName?: string;
  /** Increment (e.g. XP burst) to run in-scene scale celebration on the GLB. */
  celebrateBurstKey?: number;
  /**
   * When true, companion uses a calmer idle hint (same as concerned mood for clip pick).
   * Usually matches clinical / red-flag concern.
   */
  therapistMaterialAlert?: boolean;
  displayScaleFactor?: number;
  poseVariant?: 'default' | 'sad';
  stylizedEyes?: boolean;
};

const MOOD_ANIMATION: Record<GuardiMood, string | undefined> = {
  default: undefined,
  concerned: 'Idle',
  joy: 'Wave',
  thinking: 'Thinking',
  like: 'Like',
  sad: 'Sad',
};

/**
 * Gordie mascot in a compact responsive Canvas (rigged GLB). Prefer `animationName` for explicit clips
 * (`Wave`, `Exercise1`, …); `mood` supplies defaults when omitted.
 */
export default function GuardiMascotIcon({
  className = 'w-8 h-8',
  mood = 'default',
  animationName: animationNameProp,
  celebrateBurstKey = 0,
  therapistMaterialAlert,
  displayScaleFactor,
  poseVariant,
  stylizedEyes,
}: Props) {
  const guardiRef = useRef<GuardieModelHandle>(null);
  const prevBurstRef = useRef(0);

  useEffect(() => {
    if (celebrateBurstKey > 0 && celebrateBurstKey !== prevBurstRef.current) {
      prevBurstRef.current = celebrateBurstKey;
      guardiRef.current?.celebrate();
    }
  }, [celebrateBurstKey]);

  const alertFromMood = mood === 'concerned';
  const therapistAlert = therapistMaterialAlert ?? alertFromMood;

  const moodAnim =
    mood === 'sad'
      ? MOOD_ANIMATION.sad
      : therapistAlert
        ? MOOD_ANIMATION.concerned
        : MOOD_ANIMATION[mood];
  const animationName = animationNameProp ?? moodAnim;

  return (
    <GordieCanvas
      ref={guardiRef}
      className={className}
      variant="icon"
      animationName={animationName}
      displayScaleFactor={displayScaleFactor}
      poseVariant={poseVariant}
      stylizedEyes={stylizedEyes}
    />
  );
}
