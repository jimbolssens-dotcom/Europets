// app/_components/AdministrationRoutePicker.jsx
// Shown next to the catalog picker wherever a treatment item is being
// added, only when the selected catalog item is injectable (see migration
// 078) — the exact route isn't fixed on the catalog item, so it's chosen
// here each time the medication is actually given.

'use client';

export default function AdministrationRoutePicker({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>
        Given by...
      </option>
      <option value="sc">Subcutaneous (SC)</option>
      <option value="im">Intramuscular (IM)</option>
    </select>
  );
}
