// app/_components/AttachmentSection.jsx
// Reusable file-attachment list + uploader, used on diagnostics, surgical
// and dental reports, hospitalization notes/cases, etc. Offers a dedicated
// "Take Photo" button (opens the camera directly on phones/tablets) next
// to a regular file picker, and shows a thumbnail for image attachments.

'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadAttachment, attachmentUrl } from '@/lib/attachments';

function isImage(attachment) {
  return (
    attachment.content_type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(attachment.file_name || '')
  );
}

export default function AttachmentSection({ entityType, entityId }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

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
              {isImage(a) ? (
                <a href={attachmentUrl(a.file_path)} target="_blank" rel="noreferrer">
                  <img className="attachment-thumb" src={attachmentUrl(a.file_path)} alt={a.file_name || 'photo'} />
                </a>
              ) : (
                <a href={attachmentUrl(a.file_path)} target="_blank" rel="noreferrer">
                  {a.file_name || 'file'}
                </a>
              )}
              <button type="button" onClick={() => handleDelete(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="attachment-actions">
        <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
          📷 Take Photo
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          📎 Add File
        </button>
        {uploading && <span> Uploading...</span>}
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        hidden
      />
      <input ref={fileInputRef} type="file" onChange={handleFileChange} hidden />
    </div>
  );
}
