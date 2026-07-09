import { Link } from 'react-router-dom';

const LEGAL_LINKS: { to: string; label: string }[] = [
  { to: '/legal/terms-of-use', label: 'תנאי שימוש' },
  { to: '/legal/privacy-policy', label: 'מדיניות פרטיות' },
  { to: '/legal/medical-disclaimer', label: 'הצהרה רפואית' },
  { to: '/legal/refund-policy', label: 'מדיניות ביטולים' },
  { to: '/legal/accessibility', label: 'הצהרת נגישות' },
];

/** Subtle legal footer for patient portal pages and public legal documents. */
export default function LegalFooter() {
  return (
    <footer
      className="text-xs text-gray-400 flex flex-wrap justify-center gap-4 py-4 mt-8 border-t border-gray-200"
      dir="rtl"
    >
      <nav aria-label="קישורים משפטיים" className="flex flex-wrap items-center justify-center gap-4 w-full">
        {LEGAL_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="hover:text-teal-600 underline underline-offset-2 transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
