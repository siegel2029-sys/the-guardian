import type { KnowledgeFact } from '../types';

/** עובדות בסיס — כולן דורשות אישור מטפל לפני הצגה למטופל */
export const KNOWLEDGE_BASE_SEED: KnowledgeFact[] = [
  {
    id: 'dyk-01',
    title: 'נוירופלסטיות: המוח ממשיך להתאים את עצמו',
    explanation:
      'מחקרים מראים שהמערכת העצבית יכולה ליצור חיבורים חדשים ולשנות דפוסי שליטה גם בבגרות — עקרון מרכזי בשיקום תפקודי.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/31822078/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-02',
    title: 'תנועה מוקדמת מבוקרת תומכת בריפוי רקמות רכות',
    explanation:
      'עומס מתון ומדורג לאחר פציעה עשוי לסייע לארגון קולגן ולשיקום כושר עמידות — בהתאם להנחיה קלינית.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/29135605/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-03',
    title: 'הפחתת ישיבה ממושכת משפרת תחושת גב',
    explanation:
      'הפסקות תנועה קצרות ושינוי תנוחה במהלך היום קשורות להפחתת עומס על מבני עמוד השדרה.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/23438406/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-04',
    title: 'שתייה מספקת ותפקוד שריר',
    explanation:
      'איבוד נוזלים קל עלול להשפיע על כוח שריר ועל סיבולת — חשוב במיוחד בימים עם תרגול או חום.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/22855911/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-05',
    title: 'שינה וריפוי שריר',
    explanation:
      'שינה איכותית תומכת בהורמוני צמיחה ובתהליכי התאוששות אחרי מאמץ — חלק מהפאזל בשיקום.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/30535920/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-06',
    title: 'אימון כוח בטוח בדלקת פרקים',
    explanation:
      'בהתאמה אישית, עומס התנגדות עשוי לשפר כוח ותפקוד בדלקת פרקים — תוך מעקב קליני.',
    sourceUrl: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD004904.pub3/full',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-07',
    title: 'חימום דינמי לפני פעילות',
    explanation:
      'תנועות דינמיות עדינות לפני מאמץ עשויות לשפר טווח תנועה מושג ולהכין רקמות רכות.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/20043065/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-08',
    title: 'כאב כרוני והסברה טיפולית',
    explanation:
      'הבנת מסלולי כאב ומוח עשויה לסייע במטופלים עם כאב מתמשך — גישה ביופסיכו־חברתית.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/25494016/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-09',
    title: 'פרופריוספציה אחרי פציעה בקרסול',
    explanation:
      'תרגילי שיווי משקל ומשוב חושי תורמים לשיקום יציבות לאחר נקע — בהדרגה ובטיחות.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/20043065/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-10',
    title: 'תרגילי ליבה ועומס על עמוד השדרה',
    explanation:
      'חיזוק מרכז הגוף הבנוי נכון עשוי לתמוך בפרקי גב תחתון במטלות יומיומיות.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/23845962/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-11',
    title: 'התאוששות בין אימונים',
    explanation:
      'מנוחה ומחזורי עומס מתוכננים מאפשרים להרקמות להסתגל בלי עומס יתר.',
    sourceUrl: 'https://www.niams.nih.gov/health-topics/sports-injuries',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-12',
    title: 'כאב ופחד־תנועה (kinesiophobia)',
    explanation:
      'הימנעות ממושכת מפעילות עלולה לשמר רגישות לכאב — ליווי מקצועי תומך בחזרה בטוחה לתנועה.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/21292252/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-13',
    title: 'בריאות עצם ועומס מכני',
    explanation:
      'עומס משקל מתון וסדיר תומך בצפיפות מינרלית בעצם — רלוונטי גם לאוכלוסיות מבוגרות.',
    sourceUrl: 'https://www.niams.nih.gov/health-topics/exercise-and-bone-health',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-14',
    title: 'נשימה ושליטה במאמץ',
    explanation:
      'דפוסי נשימה מסודרים בתרגול עשויים לסייע בהפחתת מתח שרירי שרירי ולשיפור שליטה.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/29135605/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-15',
    title: 'תרגול ביתי — עקביות חשובה מעצימות חד־פעמית',
    explanation:
      'תדירות מתונה וקבועה לרוב נסבלת טוב יותר ממאמץ חד פעמי חריג.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/23438406/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-16',
    title: 'כתף: שליטה שכמית בשיקום',
    explanation:
      'תבניות תנועה יציבות של שכמה־זרוע מהוות בסיס לשיקום כאב כתף רבים.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/23845962/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-17',
    title: 'ירך וברך: חיזוק מבוקר',
    explanation:
      'תרגילי התנגדות מבוקרים תורמים לכאב ברך בהתאמה לפרוטוקול קליני.',
    sourceUrl: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD004904.pub3/full',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-18',
    title: 'השפעה פסיכולוגית על תפיסת כאב',
    explanation:
      'לחץ ומצב רוח עשויים להשפיע על חוויית כאב — טיפול שלם משלב גוף ונפש.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/25494016/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-19',
    title: 'הדרגת עומס (progressive overload)',
    explanation:
      'העלאה הדרגתית של עומס, תוך הקשבה לתסמינים, היא עקרון מפתח בהתחזקות ובשיקום.',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/29135605/',
    isApproved: false,
    source: 'seed',
  },
  {
    id: 'dyk-20',
    title: 'פעילות אירובית מתונה ובריאות כללית',
    explanation:
      'הליכה או רכיבה קלה עשויות לתמוך בבריאות לב־כלי וברווחה בתוך גבולות בטיחות אישיים.',
    sourceUrl: 'https://www.cdc.gov/physicalactivity/basics/adults/index.htm',
    isApproved: false,
    source: 'seed',
  },
];

const seedById = new Map(KNOWLEDGE_BASE_SEED.map((f) => [f.id, f]));

/** מיזוג שמירה מקומית עם סיד — שומר שדות מעודכנים (אישור, AI) ומחזיר רשימה יציבה */
export function mergeKnowledgeFactsWithSeed(persisted: KnowledgeFact[] | undefined): KnowledgeFact[] {
  const out = new Map<string, KnowledgeFact>();
  for (const s of KNOWLEDGE_BASE_SEED) {
    out.set(s.id, { ...s });
  }
  for (const p of persisted ?? []) {
    const base = seedById.get(p.id);
    if (base) {
      out.set(p.id, {
        ...base,
        ...p,
        title: p.title?.trim() ? p.title : base.title,
        explanation: p.explanation?.trim() ? p.explanation : base.explanation,
        sourceUrl: p.sourceUrl?.trim() ? p.sourceUrl : base.sourceUrl,
        source: p.source === 'ai' ? 'ai' : 'seed',
      });
    } else {
      out.set(p.id, {
        id: p.id,
        title: p.title,
        explanation: p.explanation,
        sourceUrl: p.sourceUrl,
        isApproved: Boolean(p.isApproved),
        source: p.source === 'seed' ? 'seed' : 'ai',
        createdAt: p.createdAt,
      });
    }
  }
  const seedOrder = KNOWLEDGE_BASE_SEED.map((s) => s.id);
  const extras = [...out.keys()].filter((id) => !seedById.has(id));
  extras.sort((a, b) => a.localeCompare(b));
  return [...seedOrder.map((id) => out.get(id)!), ...extras.map((id) => out.get(id)!)];
}

export function approvedKnowledgeFacts(facts: KnowledgeFact[]): KnowledgeFact[] {
  return facts.filter((f) => f.isApproved);
}
