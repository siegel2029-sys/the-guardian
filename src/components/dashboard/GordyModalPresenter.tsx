import type { ReactNode } from 'react';
import GordyMascotIcon from '../patient/GordyMascotIcon';

type Props = { children: ReactNode };

/** גורדי כמנחה בתוך מודאלים בלבד — לא על כרטיסי מטופל או מפת גוף קלינית */
export default function GordyModalPresenter({ children }: Props) {
  return (
    <div
      className="flex gap-3 items-start rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5"
      role="note"
    >
      <GordyMascotIcon className="w-10 h-10 shrink-0" />
      <div className="min-w-0 text-[12px] text-amber-950 leading-relaxed">{children}</div>
    </div>
  );
}
