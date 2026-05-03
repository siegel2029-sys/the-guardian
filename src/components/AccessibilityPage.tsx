import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

export default function AccessibilityPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #e0f7f9 0%, #f0f9fa 50%, #e8f5f0 100%)' }}
      dir="rtl"
      lang="he"
    >
      <header className="bg-white border-b border-teal-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl shadow"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <Shield className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold text-slate-800">PHYSIOSHIELD</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">הצהרת נגישות</h1>
        <p className="text-slate-500 text-sm mb-8">הצהרת נגישות - PHYSIOSHIELD</p>

        <section
          className="bg-white rounded-2xl shadow-sm border border-teal-100 p-8 space-y-4"
          aria-labelledby="accessibility-statement-heading"
        >
          <h2 id="accessibility-statement-heading" className="text-xl font-semibold text-slate-700">
            מחויבות לנגישות
          </h2>
          <p className="text-slate-600 leading-relaxed">
            אנו פועלים להנגשת האפליקציה בהתאם לתקן ת&quot;י 5568. דף זה יעודכן עם פרטי ההנגשה המלאים בקרוב.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        <Link to="/login" className="hover:text-teal-600 transition-colors">
          חזרה לדף הכניסה
        </Link>
        <span className="mx-2">·</span>
        © 2026 PHYSIOSHIELD · כל הזכויות שמורות
      </footer>
    </div>
  );
}
