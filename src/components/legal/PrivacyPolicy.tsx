import LegalPageLayout from './LegalPageLayout';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="מדיניות פרטיות" subtitle="מדיניות פרטיות - PHYSIOSHIELD">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">מדיניות פרטיות</h2>
        <p>אנו מתייחסים לפרטיות המידע הרפואי שלך ברצינות רבה.</p>
        <p>
          1. <strong>איסוף מידע:</strong> אנו אוספים מידע אישי ורפואי המוגדר על ידך או על ידי
          המטפל שלך לצורך תפעול תקין של תוכנית התרגול.
        </p>
        <p>
          2. <strong>אבטחת מידע:</strong> המידע מאוחסן בשרתים מאובטחים תוך שימוש בהצפנה. הגישה
          מוגבלת למטפל האישי שלך בלבד.
        </p>
        <p>
          3. <strong>שימוש במידע:</strong> המידע משמש למתן שירותי האפליקציה בלבד ולא יועבר
          לצדדים שלישיים ללא הסכמתך.
        </p>
      </div>
    </LegalPageLayout>
  );
}
