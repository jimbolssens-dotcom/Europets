// app/_components/AttachmentGallery.jsx
// Read-only file/photo gallery — view and open only, no upload or delete.
// Used on the client-facing hospitalization portal, and anywhere else a
// view-only list of an entity's attachments is needed. Updates live.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { attachmentUrl } from '@/lib/attachments';

function isImage(attachment) {
  return (
    attachment.content_type?.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|heic)$/i.test(attachment.file_name || '')
  );
}

export default function AttachmentGallery({ entityType, entityId, emptyText }) {
  const [attachments, setAttachments] = useState([]);

  const load = () =>
    fetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`)
      .then((res) => res.json())
      .then((data) => setAttachments(Array.isArray(data) ? data : []));

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`attachment-gallery-${entityType}-${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attachments', filter: `entity_id=eq.${entityId}` },
        load
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  if (attachments.length === 0) {
    return emptyText ? <p className="visit-meta">{emptyText}</p> : null;
  }

  return (
    <ul className="attachment-list">
      {attachments.map((a) =>
        isImage(a) ? (
          <li key={a.id}>
            <a href={attachmentUrl(a.file_path)} target="_blank" rel="noreferrer">
              <img className="attachment-thumb" src={attachmentUrl(a.file_path)} alt={a.file_name || 'photo'} />
            </a>
          </li>
        ) : (
          <li key={a.id}>
            <a href={attachmentUrl(a.file_path)} target="_blank" rel="noreferrer">
              {a.file_name || 'file'}
            </a>
          </li>
        )
      )}
    </ul>
  );
}
