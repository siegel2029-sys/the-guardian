import LegalPageLayout from './legal/LegalPageLayout';

export default function AccessibilityPage() {
  return (
    <LegalPageLayout title="הצהרת נגישות" subtitle="הצהרת נגישות - PHYSIOSHIELD">
      <div className="space-y-6 text-right p-6">
        <h1 className="text-2xl font-bold mb-4">הצהרת נגישות</h1>
        <p>
          Physio-Shield פועלת להנגשת האפליקציה לאנשים עם מוגבלות. אנו משקיעים מאמצים
          טכנולוגיים בשיפור הנגישות, כולל התאמות צבע וגודל טקסט. במידה ונתקלת בקושי, נשמח
          לפנייתך האישית.
        </p>
      </div>
    </LegalPageLayout>
  );
}
