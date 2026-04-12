import { OrbitControls } from '@react-three/drei';
import { Suspense, forwardRef, type ComponentProps } from 'react';
import { Canvas } from '@react-three/fiber';
import GordieModel, {
  GORDIE_MODEL_DEFAULT_URL,
  type GordieModelHandle,
} from './GordieModel';

export type GordieCanvasProps = {
  className?: string;
  animationName?: string;
  url?: string;
  crossfade?: number;
  /** Tighter framing for chips / FAB; `hero` matches the welcome panel. */
  variant?: 'icon' | 'hero';
  /** Orbit / zoom the camera to locate the mesh (disable on tiny touch-only chips if needed). */
  orbitControls?: boolean;
} & Omit<ComponentProps<'div'>, 'children'>;

const cameraPresets = {
  icon: {
    position: [0, 0.12, 2.85] as const,
    fov: 40,
    near: 0.12,
    far: 24,
  },
  hero: {
    position: [0, 0.15, 2.35] as const,
    fov: 42,
    near: 0.1,
    far: 40,
  },
} as const;

/**
 * Small responsive WebGL viewport with shared lighting — use anywhere you need Gordie in 2D UI.
 */
const GordieCanvas = forwardRef<GordieModelHandle, GordieCanvasProps>(function GordieCanvas(
  {
    className = 'w-8 h-8',
    animationName,
    url = GORDIE_MODEL_DEFAULT_URL,
    crossfade,
    variant = 'icon',
    orbitControls = true,
    style,
    ...divProps
  },
  ref,
) {
  const cam = cameraPresets[variant];
  const hemi = variant === 'hero' ? 0.85 : 0.88;
  const amb = variant === 'hero' ? 0.55 : 0.52;
  const key = variant === 'hero' ? 1.35 : 1.25;
  const fillDir =
    variant === 'hero'
      ? { position: [-2, 1.5, 1] as const, intensity: 0.55 }
      : { position: [-1.8, 1.4, 0.6] as const, intensity: 0.55 };

  return (
    <div
      className={`relative isolate ${className}`}
      style={{ touchAction: 'none', ...style }}
      {...divProps}
    >
      <Canvas
        className="h-full w-full block rounded-[inherit]"
        camera={{
          position: [...cam.position],
          fov: cam.fov,
          near: cam.near,
          far: cam.far,
        }}
        gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['transparent']} />
        <hemisphereLight args={['#f0f9ff', '#1e293b', hemi]} />
        <ambientLight intensity={amb} />
        <directionalLight position={[2.4, 3.2, 2.4]} intensity={key} castShadow={false} />
        <directionalLight
          position={[...fillDir.position]}
          intensity={fillDir.intensity}
          color="#93c5fd"
        />
        <pointLight position={[0, 1.2, 1.8]} intensity={0.85} distance={12} decay={2} />
        {orbitControls && (
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={0.35}
            maxDistance={12}
            target={[0, 0.55, 0]}
          />
        )}
        <Suspense fallback={null}>
          <GordieModel
            ref={ref}
            url={url}
            animationName={animationName}
            crossfade={crossfade}
          />
        </Suspense>
      </Canvas>
    </div>
  );
});

export default GordieCanvas;
