import { Construction } from 'lucide-react';

interface PlaceholderPanelProps {
  title: string;
  description: string;
  phase: string;
}

export default function PlaceholderPanel({ title, description, phase }: PlaceholderPanelProps) {
  return (
    <div className="h-full flex items-center justify-center p-6" dir="rtl">
      <div className="text-center max-w-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #ccfbf1, #d1fae5)' }}
        >
          <Construction className="w-8 h-8 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 mb-4">{description}</p>
        <span
          className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold text-teal-700"
          style={{ background: '#ccfbf1' }}
        >
          {phase}
        </span>
      </div>
    </div>
  );
}
