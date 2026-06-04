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

export const INTAKE_ACTIVATION_MISSING_HINT = '* מידע חסר לאקטיבציה';
