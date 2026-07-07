import LegalPageLayout from './LegalPageLayout';

export default function MedicalDisclaimer() {
  return (
    <LegalPageLayout title="הצהרה רפואית" subtitle="הצהרה רפואית - PHYSIOSHIELD">
      {/* TODO: Insert Hebrew Legal Text — full Medical Disclaimer */}
      <p>
        [כאן יופיע הנוסח המלא של ההצהרה הרפואית: האפליקציה אינה מהווה ייעוץ רפואי ואינה מחליפה
        טיפול רפואי מקצועי או טיפול חירום.]
      </p>
    </LegalPageLayout>
  );
}
