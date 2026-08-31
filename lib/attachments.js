// lib/attachments.js
// Client-side helper for uploading a file to the "consult-files" Storage
// bucket, then recording it against an entity (diagnostic, report, etc.)
// via our own API so the metadata is queryable from Postgres.

import { supabase } from '@/lib/supabaseClient';

export async function uploadAttachment({ entityType, entityId, file, uploadedBy }) {
  const path = `${entityType}/${entityId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('consult-files')
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: entityId,
      file_path: path,
      file_name: file.name,
      content_type: file.type,
      uploaded_by: uploadedBy || null,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save attachment record');
  }
  return data;
}

export function attachmentUrl(filePath) {
  const { data } = supabase.storage.from('consult-files').getPublicUrl(filePath);
  return data.publicUrl;
}
