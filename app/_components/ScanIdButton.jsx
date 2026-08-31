// app/_components/ScanIdButton.jsx
// Camera button that reads a photo of an Emirates ID card via
// /api/clients/scan-id and hands back { full_name, emirates_id, file } —
// the caller decides what to do with the extracted fields and the photo
// itself (fill a form, attach to a client, etc.).

'use client';

import { useRef, useState } from 'react';

export default function ScanIdButton({ onScanned, label = '📷 Scan Emirates ID' }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/clients/scan-id', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read ID card');
      onScanned({ full_name: data.full_name, emirates_id: data.emirates_id, file });
    } catch (err) {
      setError(err.message);
    }
    setScanning(false);
  }

  return (
    <span className="voice-btn-wrap">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={scanning}>
        {scanning ? 'Reading ID...' : label}
      </button>
      {error && <span className="voice-btn-error">{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        hidden
      />
    </span>
  );
}
