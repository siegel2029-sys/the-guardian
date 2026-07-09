import LegalPageLayout from './LegalPageLayout';

export default function TermsOfUse() {
  return (
    <LegalPageLayout title="תנאי שימוש" subtitle="תנאי שימוש - PHYSIOSHIELD">
      <div className="space-y-6 text-right p-6">
        <h1 className="text-2xl font-bold mb-4">תנאי שימוש באפליקציית Physio-Shield</h1>
        <section>
          <h2 className="text-lg font-semibold">1. הסכמה לתנאים</h2>
          <p>
            עצם השימוש באפליקציית Physio-Shield מהווה הסכמה מלאה ובלתי חוזרת לתנאים המפורטים
            להלן. במידה ואינך מסכים לתנאים, עליך לחדול משימוש באפליקציה לאלתר.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">2. מהות השירות</h2>
          <p>
            האפליקציה מהווה כלי עזר דיגיטלי לניהול תוכנית תרגול פיזיותרפי אישית. מובהר כי
            Physio-Shield אינה גוף רפואי ואינה מספקת אבחנות או טיפולים רפואיים.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">3. הגבלת אחריות ושיפוי</h2>
          <p>
            השימוש באפליקציה נעשה על אחריות המשתמש בלבד (&quot;As-Is&quot;). Physio-Shield לא תישא
            באחריות לכל נזק, ישיר או עקיף, הנובע משימוש באפליקציה. המשתמש מתחייב לשפות את
            בעלי האפליקציה בגין כל תביעה הנובעת משימוש שלא כדין.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">4. סמכות שיפוט</h2>
          <p>
            על הסכם זה יחולו דיני מדינת ישראל בלבד. סמכות השיפוט הבלעדית בכל עניין הקשור
            לאפליקציה תהיה נתונה לבתי המשפט המוסמכים במחוז ירושלים.
          </p>
        </section>
      </div>
    </LegalPageLayout>
  );
}
