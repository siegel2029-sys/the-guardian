import type { ComponentProps, FC, ReactNode } from 'react';
import GuardieModel, { GUARDIE_MODEL_DEFAULT_URL } from './GordieModel';

/** @deprecated Use GUARDIE_MODEL_DEFAULT_URL from `./GordieModel`. */
export const GUARDIE_RIGGED_DEFAULT_URL = GUARDIE_MODEL_DEFAULT_URL;

export type GordieRiggedModelProps = {
  url?: string;
  animationName?: string;
  crossfade?: number;
  children?: ReactNode;
} & ComponentProps<'group'>;

/**
 * Rigged Gordie with split materials (body / cape / shield) when the GLB provides separate meshes.
 */
const GordieRiggedModel: FC<GordieRiggedModelProps> = ({
  url = GUARDIE_MODEL_DEFAULT_URL,
  animationName,
  crossfade,
  children,
  ...groupProps
}) => {
  return (
    <group {...groupProps}>
      <GuardieModel url={url} animationName={animationName} crossfade={crossfade} />
      {children}
    </group>
  );
};

export default GordieRiggedModel;
