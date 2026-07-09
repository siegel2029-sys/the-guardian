import LegalPageLayout from './LegalPageLayout';

export default function MedicalDisclaimer() {
  return (
    <LegalPageLayout title="הצהרה רפואית" subtitle="הצהרה רפואית - PHYSIOSHIELD">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">הצהרת אחריות רפואית</h2>
        <p>
          Physio-Shield נועדה להוות כלי עזר לניהול תוכנית תרגול שהותאמה אישית עבורך על ידי
          פיזיותרפיסט מוסמך.
        </p>
        <p>
          1. <strong>אין תחליף לייעוץ רפואי:</strong> האפליקציה אינה מהווה אבחנה או ייעוץ רפואי.
        </p>
        <p>
          2. <strong>סיכונים:</strong> במידה ומתעורר כאב חריג, סחרחורת או תחושה חריגה, עליך
          להפסיק את הפעילות לאלתר וליצור קשר עם גורם רפואי.
        </p>
      </div>
    </LegalPageLayout>
  );
}
