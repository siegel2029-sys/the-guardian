import LegalPageLayout from './LegalPageLayout';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="מדיניות פרטיות" subtitle="מדיניות פרטיות - PHYSIOSHIELD">
      <div className="space-y-6 text-right p-6">
        <h1 className="text-2xl font-bold mb-4">מדיניות פרטיות</h1>
        <p>אנו מחויבים להגנה על המידע האישי והרפואי של המשתמשים שלנו.</p>
        <h2 className="text-lg font-semibold">איסוף ואבטחת מידע</h2>
        <p>
          המידע נאסף לצורך מתן שירותי הפיזיותרפיה בלבד. אנו משתמשים באמצעי הצפנה מתקדמים
          (SSL/TLS) ושומרים על סודיות המידע בהתאם לסטנדרטים המחמירים של ענף ה-HealthTech.
        </p>
        <h2 className="text-lg font-semibold">שמירת מידע וזכויות משתמש</h2>
        <p>
          המידע נשמר כל עוד קיים קשר טיפולי. המשתמש רשאי בכל עת לפנות בבקשה לעיון, תיקון או
          מחיקה של המידע האישי שלו מהמערכת.
        </p>
      </div>
    </LegalPageLayout>
  );
}
