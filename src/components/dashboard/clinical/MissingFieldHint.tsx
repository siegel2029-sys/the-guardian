type Props = {
  show: boolean;
  className?: string;
  /** ברירת מחדל: שדה חסר כללי; באינטייק: מידע חסר לאקטיבציה */
  message?: string;
};

export default function MissingFieldHint({ show, className = '', message = '* שדה חסר' }: Props) {
  if (!show) return null;
  return (
    <span
      className={`text-[10px] font-semibold text-purple-700 mt-0.5 block ${className}`.trim()}
      aria-live="polite"
    >
      {message}
    </span>
  );
}

/** Purple pill next to field/section titles when intake data is missing. */
export function MissingInfoBadge({ show, className = '' }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <span
      className={`ms-2 text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ${className}`.trim()}
      aria-label="חסר מידע"
    >
      חסר מידע
    </span>
  );
}

export const INTAKE_ACTIVATION_MISSING_HINT = '* מידע חסר לאקטיבציה';
export const INTAKE_MISSING_INFO_LABEL = 'חסר מידע';
