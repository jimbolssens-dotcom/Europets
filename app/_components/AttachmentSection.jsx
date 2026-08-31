// app/_components/AttachmentSection.jsx
// Reusable file-attachment list + uploader, used on diagnostics, surgical
// and dental reports, and hospitalization notes.

'use client';

import { useEffect, useState } from 'react';
import { uploadAttachment, attachmentUrl } from '@/lib/attachments';

export default function AttachmentSection({ entityType, entityId }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const load = () =>
    fetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`)
      .then((res) => res.json())
      .then((data) => setAttachments(Array.isArray(data) ? data : []));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadAttachment({ entityType, entityId, file });
      load();
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleDelete(id) {
    if (!confirm('Delete this file?')) return;
    await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="attachments">
      {error && <p className="error">{error}</p>}
      {attachments.length > 0 && (
        <ul className="attachment-list">
          {attachments.map((a) => (
            <li key={a.id}>
              <a href={attachmentUrl(a.file_path)} target="_blank" rel="noreferrer">
                {a.file_name || 'file'}
              </a>
              <button type="button" onClick={() => handleDelete(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      {uploading && <span> Uploading...</span>}
    </div>
  );
}
