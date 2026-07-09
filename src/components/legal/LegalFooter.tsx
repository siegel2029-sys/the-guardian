import { Link } from 'react-router-dom';

const LEGAL_LINKS: { to: string; label: string }[] = [
  { to: '/terms', label: 'תנאי שימוש' },
  { to: '/privacy', label: 'מדיניות פרטיות' },
  { to: '/medical-disclaimer', label: 'הצהרה רפואית' },
  { to: '/refund-policy', label: 'מדיניות ביטולים והחזרים' },
  { to: '/accessibility', label: 'הצהרת נגישות' },
];

/** App-wide legal footer: static links to all legal pages + copyright. */
export default function LegalFooter() {
  return (
    <footer
      className="border-t border-slate-200 bg-white py-4 px-4 text-center text-xs text-slate-400"
      dir="rtl"
    >
      <nav aria-label="קישורים משפטיים" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {LEGAL_LINKS.map((link, i) => (
          <span key={link.to} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            <Link
              to={link.to}
              className="hover:text-teal-600 underline underline-offset-2 transition-colors"
            >
              {link.label}
            </Link>
          </span>
        ))}
      </nav>
      <p className="mt-2">© PHYSIOSHIELD 2026 - כל הזכויות שמורות</p>
    </footer>
  );
}
