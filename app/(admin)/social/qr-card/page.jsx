// app/(admin)/social/qr-card/page.jsx
// A printable card for the reception desk: a QR code to the clinic's
// Instagram (lib/clinicSocial.js), so owners waiting with their pet follow
// us there and then. Two cards per A4 page, to cut out.

'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/clinicSocial';

function Card({ qr }) {
  return (
    <div className="qr-card">
      <img src="/logo.png" alt="Europets Clinic" className="qr-card-logo" />
      <div className="qr-card-title">Follow us on Instagram</div>
      <div className="qr-card-sub">See your pet&apos;s photos, our team and tips from our vets</div>
      {qr ? <img src={qr} alt={`QR code for instagram.com/${INSTAGRAM_HANDLE}`} className="qr-card-code" /> : <div className="qr-card-code" />}
      <div className="qr-card-handle">@{INSTAGRAM_HANDLE}</div>
      <div className="qr-card-hint">Scan with your phone camera</div>
    </div>
  );
}

export default function SocialQrCardPage() {
  const [qr, setQr] = useState(null);

  useEffect(() => {
    QRCode.toDataURL(INSTAGRAM_URL, { width: 600, margin: 1, color: { dark: '#1d1b19', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  return (
    <div className="qr-card-page">
      <div className="page-header qr-card-noprint">
        <h1>Reception QR card</h1>
        <div className="page-header-actions">
          <a href="/social" className="button-link social-ghost">‹ Social</a>
          <button type="button" onClick={() => window.print()} disabled={!qr}>🖨 Print</button>
        </div>
      </div>
      <p className="visit-meta qr-card-noprint">Prints two cards on one A4 page. Stand one at the desk, one in the waiting area.</p>
      <div className="qr-card-sheet">
        <Card qr={qr} />
        <Card qr={qr} />
      </div>
    </div>
  );
}
