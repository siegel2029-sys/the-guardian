import { OrbitControls } from '@react-three/drei';
import { Suspense, forwardRef, type ComponentProps } from 'react';
import { Canvas } from '@react-three/fiber';
import GuardieModel, {
  GUARDIE_MODEL_DEFAULT_URL,
  type GuardieModelHandle,
} from './GordieModel';

export type GuardieCanvasProps = {
  className?: string;
  animationName?: string;
  url?: string;
  crossfade?: number;
  /** Tighter framing for chips / FAB; `hero` matches the welcome panel. */
  variant?: 'icon' | 'hero';
  /** Orbit / zoom the camera to locate the mesh (disable on tiny touch-only chips if needed). */
  orbitControls?: boolean;
  /** Multiplies model unit scale; camera backs out proportionally so framing stays balanced. */
  displayScaleFactor?: number;
  poseVariant?: 'default' | 'sad';
  stylizedEyes?: boolean;
} & Omit<ComponentProps<'div'>, 'children'>;

/** Tighter FOV + closer Z ≈ portrait framing on face / upper torso; target sits on chest height. */
const cameraPresets = {
  icon: {
    position: [0, 0.42, 1.72] as const,
    fov: 34,
    near: 0.08,
    far: 28,
    orbitTarget: [0, 0.68, 0] as const,
  },
  hero: {
    position: [0, 0.55, 1.22] as const,
    fov: 30,
    near: 0.06,
    far: 48,
    orbitTarget: [0, 0.78, 0] as const,
  },
} as const;

/**
 * Small responsive WebGL viewport with shared lighting — Guardi 3D rig in 2D UI shells.
 */
const GuardieCanvas = forwardRef<GuardieModelHandle, GuardieCanvasProps>(function GuardieCanvas(
  {
    className = 'w-8 h-8',
    animationName,
    url = GUARDIE_MODEL_DEFAULT_URL,
    crossfade,
    variant = 'icon',
    orbitControls = true,
    displayScaleFactor = 1,
    poseVariant = 'default',
    stylizedEyes = false,
    style,
    ...divProps
  },
  ref,
) {
  const cam = cameraPresets[variant];
  const zMul = displayScaleFactor;
  const camPos = [
    cam.position[0],
    cam.position[1],
    cam.position[2] * zMul,
  ] as const;
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
          position: [...camPos],
          fov: cam.fov,
          near: cam.near,
          far: cam.far * Math.max(1, zMul * 0.85),
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
            minDistance={0.22 * zMul}
            maxDistance={12 * zMul}
            target={[...cam.orbitTarget]}
          />
        )}
        <Suspense fallback={null}>
          <GuardieModel
            ref={ref}
            url={url}
            animationName={animationName}
            crossfade={crossfade}
            displayScaleFactor={displayScaleFactor}
            poseVariant={poseVariant}
            stylizedEyes={stylizedEyes}
            position={variant === 'hero' ? ([0, -0.05, 0] as const) : ([0, -0.03, 0] as const)}
            scale={variant === 'hero' ? 1.12 : 1.05}
          />
        </Suspense>
      </Canvas>
    </div>
  );
});

export default GuardieCanvas;
