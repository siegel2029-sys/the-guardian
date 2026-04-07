import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';

interface BodyMapSVGProps {
  activeAreas: BodyArea[];
  primaryArea?: BodyArea;
  onAreaClick?: (area: BodyArea) => void;
  selectedArea?: BodyArea | null;
}

// Colour helpers
const INACTIVE = '#dde8ec';
const INACTIVE_STROKE = '#b0cdd6';
const ACTIVE = '#5eead4';
const ACTIVE_STROKE = '#0d9488';
const PRIMARY = '#0d9488';
const PRIMARY_STROKE = '#0f766e';
const SELECTED = '#99f6e4';
const SELECTED_STROKE = '#14b8a6';

export default function BodyMapSVG({
  activeAreas,
  primaryArea,
  onAreaClick,
  selectedArea,
}: BodyMapSVGProps) {
  const isActive = (area: BodyArea) => activeAreas.includes(area);
  const isPrimary = (area: BodyArea) => area === primaryArea;
  const isSelected = (area: BodyArea) => area === selectedArea;

  const getFill = (area: BodyArea) => {
    if (isSelected(area)) return SELECTED;
    if (isPrimary(area)) return PRIMARY;
    if (isActive(area)) return ACTIVE;
    return INACTIVE;
  };

  const getStroke = (area: BodyArea) => {
    if (isSelected(area)) return SELECTED_STROKE;
    if (isPrimary(area)) return PRIMARY_STROKE;
    if (isActive(area)) return ACTIVE_STROKE;
    return INACTIVE_STROKE;
  };

  const getOpacity = (area: BodyArea) => {
    if (isPrimary(area) || isActive(area) || isSelected(area)) return 1;
    return 0.75;
  };

  const zoneProps = (area: BodyArea) => ({
    fill: getFill(area),
    stroke: getStroke(area),
    strokeWidth: isPrimary(area) ? 2 : 1.5,
    opacity: getOpacity(area),
    style: onAreaClick ? { cursor: 'pointer' } : {},
    onClick: onAreaClick ? () => onAreaClick(area) : undefined,
    role: onAreaClick ? 'button' : undefined,
    'aria-label': bodyAreaLabels[area],
  });

  return (
    <svg
      viewBox="0 0 200 460"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', maxHeight: '460px' }}
      aria-label="מפת גוף"
    >
      <defs>
        {/* Glow filter for active/primary zones */}
        <filter id="glow-teal" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-primary" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── HEAD ─────────────────────────────────────────────── */}
      <ellipse cx="100" cy="38" rx="30" ry="34"
        fill="#dde8ec" stroke="#b0cdd6" strokeWidth="1.5" opacity="0.75"
      />
      {/* Face details (non-interactive) */}
      <ellipse cx="91" cy="34" rx="4" ry="5" fill="#c8dde4" />
      <ellipse cx="109" cy="34" rx="4" ry="5" fill="#c8dde4" />
      <path d="M92,50 Q100,55 108,50" fill="none" stroke="#c8dde4" strokeWidth="1.5" strokeLinecap="round" />

      {/* ── NECK ─────────────────────────────────────────────── */}
      <rect
        x="88" y="70" width="24" height="22" rx="5"
        {...zoneProps('neck')}
        filter={isActive('neck') ? (isPrimary('neck') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── LEFT SHOULDER (visually on the right, body map is mirrored) ── */}
      <path
        d="M136,86 Q154,80 164,92 L168,112 Q165,126 150,124 L136,118 Z"
        {...zoneProps('shoulder_left')}
        filter={isActive('shoulder_left') ? (isPrimary('shoulder_left') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── RIGHT SHOULDER ───────────────────────────────────── */}
      <path
        d="M64,86 Q46,80 36,92 L32,112 Q35,126 50,124 L64,118 Z"
        {...zoneProps('shoulder_right')}
        filter={isActive('shoulder_right') ? (isPrimary('shoulder_right') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── UPPER TORSO (back_upper) ─────────────────────────── */}
      <path
        d="M64,88 L64,118 L58,165 L142,165 L136,118 L136,88 Q118,82 100,82 Q82,82 64,88 Z"
        {...zoneProps('back_upper')}
        filter={isActive('back_upper') ? (isPrimary('back_upper') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── LOWER TORSO (back_lower) ─────────────────────────── */}
      <path
        d="M58,165 L56,212 L144,212 L142,165 Z"
        {...zoneProps('back_lower')}
        filter={isActive('back_lower') ? (isPrimary('back_lower') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── LEFT UPPER ARM ───────────────────────────────────── */}
      <path
        d="M150,124 L168,112 L172,158 L156,164 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── RIGHT UPPER ARM ──────────────────────────────────── */}
      <path
        d="M50,124 L32,112 L28,158 L44,164 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── LEFT ELBOW ───────────────────────────────────────── */}
      <ellipse cx="162" cy="164" rx="12" ry="10"
        {...zoneProps('elbow_left')}
        filter={isActive('elbow_left') ? 'url(#glow-teal)' : undefined}
      />

      {/* ── RIGHT ELBOW ──────────────────────────────────────── */}
      <ellipse cx="38" cy="164" rx="12" ry="10"
        {...zoneProps('elbow_right')}
        filter={isActive('elbow_right') ? 'url(#glow-teal)' : undefined}
      />

      {/* ── LEFT FOREARM ─────────────────────────────────────── */}
      <path
        d="M156,168 L172,162 L174,208 L158,210 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── RIGHT FOREARM ────────────────────────────────────── */}
      <path
        d="M44,168 L28,162 L26,208 L42,210 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── LEFT WRIST ───────────────────────────────────────── */}
      <ellipse cx="166" cy="216" rx="11" ry="8"
        {...zoneProps('wrist_left')}
        filter={isActive('wrist_left') ? 'url(#glow-teal)' : undefined}
      />

      {/* ── RIGHT WRIST ──────────────────────────────────────── */}
      <ellipse cx="34" cy="216" rx="11" ry="8"
        {...zoneProps('wrist_right')}
        filter={isActive('wrist_right') ? 'url(#glow-teal)' : undefined}
      />

      {/* ── LEFT HAND (non-interactive) ──────────────────────── */}
      <ellipse cx="167" cy="230" rx="10" ry="13"
        fill="#dde8ec" stroke="#b0cdd6" strokeWidth="1" opacity="0.6"
      />

      {/* ── RIGHT HAND ───────────────────────────────────────── */}
      <ellipse cx="33" cy="230" rx="10" ry="13"
        fill="#dde8ec" stroke="#b0cdd6" strokeWidth="1" opacity="0.6"
      />

      {/* ── PELVIS / HIP AREA ────────────────────────────────── */}
      <path
        d="M56,212 L52,240 L148,240 L144,212 Z"
        fill="#dde8ec" stroke="#b0cdd6" strokeWidth="1.5" opacity="0.75"
      />

      {/* ── LEFT HIP ─────────────────────────────────────────── */}
      <ellipse cx="128" cy="240" rx="22" ry="14"
        {...zoneProps('hip_left')}
        filter={isActive('hip_left') ? (isPrimary('hip_left') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── RIGHT HIP ────────────────────────────────────────── */}
      <ellipse cx="72" cy="240" rx="22" ry="14"
        {...zoneProps('hip_right')}
        filter={isActive('hip_right') ? (isPrimary('hip_right') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── LEFT THIGH ───────────────────────────────────────── */}
      <path
        d="M112,248 L148,246 L146,316 L114,318 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── RIGHT THIGH ──────────────────────────────────────── */}
      <path
        d="M88,248 L52,246 L54,316 L86,318 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── LEFT KNEE ────────────────────────────────────────── */}
      <ellipse cx="130" cy="324" rx="18" ry="13"
        {...zoneProps('knee_left')}
        filter={isActive('knee_left') ? (isPrimary('knee_left') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── RIGHT KNEE ───────────────────────────────────────── */}
      <ellipse cx="70" cy="324" rx="18" ry="13"
        {...zoneProps('knee_right')}
        filter={isActive('knee_right') ? (isPrimary('knee_right') ? 'url(#glow-primary)' : 'url(#glow-teal)') : undefined}
      />

      {/* ── LEFT SHIN ────────────────────────────────────────── */}
      <path
        d="M116,334 L144,334 L140,392 L118,392 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── RIGHT SHIN ───────────────────────────────────────── */}
      <path
        d="M84,334 L56,334 L60,392 L82,392 Z"
        fill={INACTIVE} stroke={INACTIVE_STROKE} strokeWidth="1.5" opacity="0.75"
      />

      {/* ── LEFT ANKLE ───────────────────────────────────────── */}
      <ellipse cx="129" cy="400" rx="14" ry="9"
        {...zoneProps('ankle_left')}
        filter={isActive('ankle_left') ? 'url(#glow-teal)' : undefined}
      />

      {/* ── RIGHT ANKLE ──────────────────────────────────────── */}
      <ellipse cx="71" cy="400" rx="14" ry="9"
        {...zoneProps('ankle_right')}
        filter={isActive('ankle_right') ? 'url(#glow-teal)' : undefined}
      />

      {/* ── LEFT FOOT ────────────────────────────────────────── */}
      <path
        d="M116,408 Q117,420 138,422 L148,420 L148,410 L116,408Z"
        fill="#dde8ec" stroke="#b0cdd6" strokeWidth="1" opacity="0.55"
      />

      {/* ── RIGHT FOOT ───────────────────────────────────────── */}
      <path
        d="M84,408 Q83,420 62,422 L52,420 L52,410 L84,408Z"
        fill="#dde8ec" stroke="#b0cdd6" strokeWidth="1" opacity="0.55"
      />

      {/* ── Pulse ring on primary area (animated) ─────────────── */}
      {primaryArea === 'back_lower' && (
        <ellipse cx="100" cy="188" rx="30" ry="25"
          fill="none" stroke="#0d9488" strokeWidth="2" opacity="0.4">
          <animate attributeName="r" values="30;38;30" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </ellipse>
      )}
      {primaryArea === 'knee_right' && (
        <circle cx="70" cy="324" r="20"
          fill="none" stroke="#0d9488" strokeWidth="2" opacity="0.4">
          <animate attributeName="r" values="20;28;20" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      {primaryArea === 'knee_left' && (
        <circle cx="130" cy="324" r="20"
          fill="none" stroke="#0d9488" strokeWidth="2" opacity="0.4">
          <animate attributeName="r" values="20;28;20" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      {primaryArea === 'shoulder_right' && (
        <ellipse cx="48" cy="105" rx="22" ry="16"
          fill="none" stroke="#0d9488" strokeWidth="2" opacity="0.4">
          <animate attributeName="rx" values="22;30;22" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </ellipse>
      )}
      {primaryArea === 'shoulder_left' && (
        <ellipse cx="152" cy="105" rx="22" ry="16"
          fill="none" stroke="#0d9488" strokeWidth="2" opacity="0.4">
          <animate attributeName="rx" values="22;30;22" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* ── Body centre-line (subtle guide) ─────────────────── */}
      <line x1="100" y1="72" x2="100" y2="210"
        stroke="#c4d8e0" strokeWidth="0.75" strokeDasharray="3,4" opacity="0.5"
      />
    </svg>
  );
}
