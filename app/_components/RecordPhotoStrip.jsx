// app/_components/RecordPhotoStrip.jsx
// A row of small photo thumbnails for one consult or hospital stay in a
// patient's history, each captioned with where on the record it was filed
// ("Consult", "X-ray", "Day 2 note"...). Shows the first `max` (3 fits one row on a phone) and a
// "+N more" button for the rest; tapping a photo opens it full size.
// `photos` comes from GET /api/patients/:id/photos (lib/patientPhotos.js).

'use client';

import { useState } from 'react';
import { attachmentUrl } from '@/lib/attachments';

export default function RecordPhotoStrip({ photos, max = 3 }) {
  const [showAll, setShowAll] = useState(false);
  if (!photos?.length) return null;
  const shown = showAll ? photos : photos.slice(0, max);
  const hidden = photos.length - shown.length;
  return (
    <div className="record-photo-strip" aria-label={`${photos.length} photo${photos.length === 1 ? '' : 's'}`}>
      {shown.map((p) => (
        <a key={p.id} className="record-photo" href={attachmentUrl(p.file_path)} target="_blank" rel="noreferrer"
          title={`${p.source}${p.file_name ? ` · ${p.file_name}` : ''}`}>
          <img src={attachmentUrl(p.file_path)} alt={p.source} loading="lazy" />
          <span className="record-photo-label">{p.source}</span>
        </a>
      ))}
      {hidden > 0 && (
        <button type="button" className="record-photo-more" onClick={() => setShowAll(true)}>
          +{hidden} more
        </button>
      )}
    </div>
  );
}
