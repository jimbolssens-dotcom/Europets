// app/_components/CrossRecordLinks.jsx
// A same-visit's Consult, Day Procedure, Hospitalization, and Invoice
// pages all cross-link to whichever of the other three exist (see the
// color-coded button-link-consult/-hospitalization/-day-procedure/-invoice
// classes in globals.css) — this just groups those specific buttons into
// one visually consistent, recognizable unit on each of the four pages,
// distinct from that page's own actions (Discharge, Summary, Photos, ...).
// Each page keeps its own linking logic/markup as children; this only
// supplies the shared container.

export default function CrossRecordLinks({ children }) {
  return (
    <div className="cross-record-links" role="group" aria-label="Linked records">
      <span className="cross-record-links-label">Linked Records</span>
      {children}
    </div>
  );
}
