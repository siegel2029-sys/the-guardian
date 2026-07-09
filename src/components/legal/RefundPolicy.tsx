import LegalPageLayout from './LegalPageLayout';

export default function RefundPolicy() {
  return (
    <LegalPageLayout title="מדיניות ביטולים והחזרים" subtitle="מדיניות ביטולים והחזרים - PHYSIOSHIELD">
      <div className="space-y-6 text-right p-6">
        <h1 className="text-2xl font-bold mb-4">מדיניות ביטולים והפסקת שימוש</h1>
        <p>ביטול מפגשי פיזיותרפיה פיזיים כפוף להודעה מראש של 24 שעות.</p>
        <p>
          <strong>הפסקת שימוש באפליקציה:</strong> המשתמש רשאי להפסיק את השימוש באפליקציה בכל
          עת, ללא עלות. למחיקת נתוני חשבון, יש לפנות למטפל האישי.
        </p>
      </div>
    </LegalPageLayout>
  );
}
