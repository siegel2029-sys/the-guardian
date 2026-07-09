import LegalPageLayout from './LegalPageLayout';

export default function TermsOfUse() {
  return (
    <LegalPageLayout title="תנאי שימוש" subtitle="תנאי שימוש - PHYSIOSHIELD">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">תנאי שימוש באפליקציית Physio-Shield</h2>
        <p>
          1. <strong>הסכמה:</strong> בעצם השימוש באפליקציה, הנך מסכים/ה לתנאים אלו. אם אינך
          מסכים, עליך להפסיק את השימוש לאלתר.
        </p>
        <p>
          2. <strong>מהות השירות:</strong> האפליקציה משמשת ככלי דיגיטלי למעקב אחר תוכנית תרגול
          שהותאמה אישית ע&quot;י המטפל שלך. Physio-Shield אינה מספקת שירותי רפואה, אבחון או ייעוץ
          רפואי.
        </p>
        <p>
          3. <strong>הגבלת אחריות:</strong> השימוש באפליקציה נעשה על אחריות המשתמש בלבד
          (&quot;As-Is&quot;). Physio-Shield לא תהיה אחראית לכל נזק, ישיר או עקיף, הנובע משימוש או
          מאי-יכולת להשתמש באפליקציה.
        </p>
        <p>
          4. <strong>אחריות המטופל:</strong> עליך לפעול אך ורק לפי הנחיות המטפל המוסמך שלך. בכל
          מקרה של כאב חריג, עליך להפסיק את הפעילות מיד ולפנות לגורם רפואי.
        </p>
        <p>
          5. <strong>קניין רוחני:</strong> כל התכנים הם קניינה הבלעדי של Physio-Shield.
        </p>
        <p>
          6. <strong>סמכות שיפוט:</strong> סמכות השיפוט הבלעדית תהיה נתונה לבתי המשפט המוסמכים
          במחוז ירושלים.
        </p>
      </div>
    </LegalPageLayout>
  );
}
