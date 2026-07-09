import LegalPageLayout from './LegalPageLayout';

export default function MedicalDisclaimer() {
  return (
    <LegalPageLayout title="הצהרה רפואית" subtitle="הצהרה רפואית - PHYSIOSHIELD">
      <div className="space-y-6 text-right p-6">
        <h1 className="text-2xl font-bold mb-4">הצהרת אחריות רפואית</h1>
        <p>Physio-Shield נועדה אך ורק כתמיכה בתוכנית תרגול שהותאמה על ידי מטפל מוסמך.</p>
        <ul className="list-disc pr-6">
          <li>
            <strong>אי-נטילת אחריות על תוצאות:</strong> אין באפליקציה משום התחייבות לתוצאה
            רפואית כזו או אחרת.
          </li>
          <li>
            <strong>אזהרת בטיחות:</strong> במקרה של כאב חריג, קוצר נשימה או תחושה לא תקינה,
            חובה על המשתמש לעצור מיד את התרגול ולפנות לייעוץ רפואי.
          </li>
        </ul>
      </div>
    </LegalPageLayout>
  );
}
