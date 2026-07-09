import LegalPageLayout from './LegalPageLayout';

function RefundPolicyBody() {
  return (
    <div className="space-y-6 text-right">
      <h2 className="text-xl font-bold">מדיניות ביטולים והפסקת שימוש</h2>
      <p>ביטול מפגשי פיזיותרפיה פיזיים כפוף להודעה מראש של 24 שעות.</p>
      <p>
        <strong>הפסקת שימוש באפליקציה:</strong> המשתמש רשאי להפסיק את השימוש באפליקציה בכל
        עת, ללא עלות. למחיקת נתוני חשבון, יש לפנות למטפל האישי.
      </p>
      <section>
        <h3 className="text-base font-semibold">הפרעות בשירות</h3>
        <p>
          Physio-Shield שואפת לספק שירות רציף ויציב, אך אינה מתחייבת לזמינות רציפה ללא
          הפרעות. השירות עשוי להיות מושעה, מוגבל או מופסק באופן זמני לצורך תחזוקה,
          עדכונים, אבטחה, תיקון תקלות או שיקולים תפעוליים אחרים. הפרעה זמנית בשירות
          הדיגיטלי אינה, כשלעצמה, מקימה זכות להחזר כספי בגין מפגשים קליניים פיזיים שנקבעו
          מול המטפל, אלא אם הוסכם אחרת מול המטפל או על פי דין.
        </p>
      </section>
      <section>
        <h3 className="text-base font-semibold">כוח עליון (Force Majeure)</h3>
        <p>
          Physio-Shield לא תישא באחריות לאיחור, לאי-ביצוע או להפרעה במתן השירות הנובעים
          מנסיבות שאינן בשליטתה הסבירה, לרבות אך לא רק: אסונות טבע, מלחמה, טרור, מגפות,
          שביתות, תקלות בתשתיות תקשורת או חשמל, כשל בספקי ענן או צד שלישי, צווים
          ממשלתיים או אירועים בלתי צפויים אחרים. במקרים כאלה ייעשה מאמץ סביר לחדש את
          השירות בהקדם האפשרי, מבלי שתיחשב הפרה של מדיניות זו.
        </p>
      </section>
      <section>
        <h3 className="text-base font-semibold">בירורים מול המטפל</h3>
        <p>
          שאלות הנוגעות לביטול מפגשים פיזיים, חיובים או החזרים בגין טיפול קליני יש
          להפנות ישירות למטפל האישי או למרפאה המטפלת, בהתאם להסכם הטיפולי שביניכם.
          מדיניות זו חלה על השימוש באפליקציה הדיגיטלית ואינה מחליפה הסכמים מסחריים או
          קליניים מול המטפל.
        </p>
      </section>
    </div>
  );
}

/** Public page, or `embedded` body for in-modal accordions (no page chrome). */
export default function RefundPolicy({ embedded = false }: { embedded?: boolean }) {
  const body = (
    <div className={embedded ? undefined : 'p-6'}>
      <RefundPolicyBody />
    </div>
  );
  if (embedded) return body;
  return (
    <LegalPageLayout title="מדיניות ביטולים והחזרים" subtitle="מדיניות ביטולים והחזרים - PHYSIOSHIELD">
      {body}
    </LegalPageLayout>
  );
}
