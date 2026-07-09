import LegalPageLayout from './legal/LegalPageLayout';

export default function AccessibilityPage() {
  return (
    <LegalPageLayout title="הצהרת נגישות" subtitle="הצהרת נגישות - PHYSIOSHIELD">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">הצהרת נגישות</h2>
        <p>
          אנו ב-Physio-Shield מחויבים להנגשת האפליקציה כחלק מתהליך מתמשך של שיפור חוויית
          המשתמש. אנו בתהליך הטמעה של כלים טכנולוגיים לשינוי ניגודיות וגודל טקסט. במידה ונתקלת
          בקושי, נשמח לסיוע מולך באופן אישי.
        </p>
      </div>
    </LegalPageLayout>
  );
}
