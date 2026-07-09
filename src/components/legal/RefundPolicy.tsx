import LegalPageLayout from './LegalPageLayout';

export default function RefundPolicy() {
  return (
    <LegalPageLayout title="מדיניות ביטולים והחזרים" subtitle="מדיניות ביטולים והחזרים - PHYSIOSHIELD">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">מדיניות ביטולים והפסקת שימוש</h2>
        <p>
          1. <strong>ביטול מפגשים:</strong> ביטול טיפול פיזיותרפי יעשה בהודעה מראש של לפחות 24
          שעות.
        </p>
        <p>
          2. <strong>הפסקת שימוש באפליקציה:</strong> בכל עת, הנך רשאי/ת להפסיק את השימוש
          באפליקציה ללא הודעה מוקדמת. לבקשתך, ניתן לפנות למטפל שלך בבקשה למחיקת המידע האישי
          מהמערכת.
        </p>
      </div>
    </LegalPageLayout>
  );
}
