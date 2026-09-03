// app/_components/AdministrationMethodSelect.jsx
// A "how was this given?" selector for a medication treatment item —
// dispensed, given subcutaneously (SC), or given intramuscularly (IM).
// Shown only for a catalog item that supports at least one of these (see
// allow_dispense/allow_sc/allow_im on goods_services, set on the Catalog
// page). Whichever method is chosen drives an automatic administration
// fee line item when the treatment plan is invoiced (see lib/invoicing.js).

export const ADMINISTRATION_METHOD_LABELS = {
  dispense: 'Dispensed',
  sc: 'Subcutaneous (SC)',
  im: 'Intramuscular (IM)',
};

export default function AdministrationMethodSelect({ catalogItem, value, onChange }) {
  if (!catalogItem) return null;
  const options = ['dispense', 'sc', 'im'].filter((m) => catalogItem[`allow_${m}`]);
  if (options.length === 0) return null;

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">How given? (adds a fee)</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {ADMINISTRATION_METHOD_LABELS[m]}
        </option>
      ))}
    </select>
  );
}
