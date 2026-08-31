// app/_components/ScanIdButton.jsx
// Reads a photo of an Emirates ID card via /api/clients/scan-id and hands
// back { full_name, emirates_id, file } — the caller decides what to do
// with the extracted fields and the photo itself (fill a form, attach to
// a client, etc.). Offers two ways to get the photo in: the camera
// directly (opens the device camera on phones/tablets), or picking an
// already-taken photo from the gallery/files.

'use client';

import { useRef, useState } from 'react';

export default function ScanIdButton({
  onScanned,
  label = '📷 Scan Emirates ID',
  uploadLabel = '🖼️ Upload ID Photo',
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
      <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={scanning}>
        {scanning ? 'Reading ID...' : label}
      </button>
      <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={scanning}>
        {scanning ? 'Reading ID...' : uploadLabel}
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
