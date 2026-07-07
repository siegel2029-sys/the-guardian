import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import LegalFooter from './LegalFooter';

/** Shared shell for the public legal pages (mirrors AccessibilityPage styling). */
export default function LegalPageLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #e0f7f9 0%, #f0f9fa 50%, #e8f5f0 100%)' }}
      dir="rtl"
      lang="he"
    >
      <header className="bg-white border-b border-teal-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl shadow"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              <Shield className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold text-slate-800">PHYSIOSHIELD</span>
          </div>
          <Link to="/" className="text-sm text-teal-700 hover:text-teal-800 underline underline-offset-2">
            חזרה לאפליקציה
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm mb-8">{subtitle}</p>}
        <section className="bg-white rounded-2xl shadow-sm border border-teal-100 p-8 space-y-4 text-slate-600 leading-relaxed">
          {children}
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
