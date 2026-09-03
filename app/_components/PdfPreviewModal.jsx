// app/_components/PdfPreviewModal.jsx
// Shows a PDF inline, on top of the current page, instead of navigating
// there — used as printPdfUrl's fallback when a browser (iPad/iOS Safari,
// notably) won't print from a hidden iframe. Nothing ever leaves the app's
// page, so "getting back" is just tapping Close; no lost browser history,
// no dead end in a home-screen-installed PWA with no back button. The
// embedded PDF still carries the platform's own viewer controls (zoom,
// share/print icon on iOS, a print icon in Chrome's PDF viewer, etc.).

'use client';

export default function PdfPreviewModal({ url, onClose }) {
  if (!url) return null;

  return (
    <div className="pdf-preview-backdrop" onClick={onClose}>
      <div className="pdf-preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-preview-bar">
          <span>Consent Form</span>
          <button type="button" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <iframe src={url} title="PDF preview" className="pdf-preview-frame" />
      </div>
    </div>
  );
}
