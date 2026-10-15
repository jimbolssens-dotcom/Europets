// A consent form's text for reading before signing. A paragraph written
// all in capitals is a warning the owner must not miss (the small pet
// handling risk, lib/consentTemplates.js), so it's shown bold and pink,
// the same as on the signed PDF (lib/consentFormPdf.js).
export function isConsentWarning(paragraph) {
  return /[A-Z]{4}/.test(paragraph) && paragraph === paragraph.toUpperCase();
}

export default function ConsentText({ text, className = 'consent-text-box' }) {
  const paragraphs = String(text || '').split(/\n\n+/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className={isConsentWarning(p) ? 'consent-warning' : undefined}>
          {p}
        </p>
      ))}
    </div>
  );
}
