// app/_components/ScanReceiptButton.jsx
// Reads a photo of a supplier receipt/invoice via /api/expenses/scan and
// hands back { vendor_name, expense_date, amount, vat_amount, category,
// file } — the caller decides what to do with the extracted fields and
// the photo itself (fill the expense form, attach it once the expense is
// saved, etc.). Same two-ways-in pattern as ScanIdButton: camera directly,
// or picking an already-taken photo from the gallery/files.

'use client';

import { useRef, useState } from 'react';

export default function ScanReceiptButton({
  onScanned,
  label = '📷 Scan Receipt',
  uploadLabel = '🖼️ Upload Receipt Photo',
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/expenses/scan', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read the receipt');

      // If the server had to convert a HEIC photo to JPEG to read it, save
      // that JPEG as the attachment too — HEIC files saved as-is show up as
      // a broken image in most browsers other than Safari.
      let attachFile = file;
      if (data.converted_image) {
        const convertedBlob = await (await fetch(data.converted_image)).blob();
        const jpegName = (file.name || 'receipt').replace(/\.\w+$/, '') + '.jpg';
        attachFile = new File([convertedBlob], jpegName, { type: 'image/jpeg' });
      }

      onScanned({
        vendor_name: data.vendor_name,
        expense_date: data.expense_date,
        amount: data.amount,
        vat_amount: data.vat_amount,
        category: data.category,
        file: attachFile,
      });
    } catch (err) {
      setError(err.message);
    }
    setScanning(false);
  }

  return (
    <span className="voice-btn-wrap">
      <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={scanning}>
        {scanning ? 'Reading Receipt...' : label}
      </button>
      <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={scanning}>
        {scanning ? 'Reading Receipt...' : uploadLabel}
      </button>
      {error && <span className="voice-btn-error">{error}</span>}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        hidden
      />
      <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleFile} hidden />
    </span>
  );
}
