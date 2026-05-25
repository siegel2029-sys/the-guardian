type Props = {
  show: boolean;
  className?: string;
};

export default function MissingFieldHint({ show, className = '' }: Props) {
  if (!show) return null;
  return (
    <span
      className={`text-[10px] font-semibold text-blue-700 mt-0.5 block ${className}`.trim()}
      aria-live="polite"
    >
      * שדה חסר
    </span>
  );
}
