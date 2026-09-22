// lib/attachments.js
// Client-side helper for uploading a file to the "consult-files" Storage
// bucket, then recording it against an entity (diagnostic, report, etc.)
// via our own API so the metadata is queryable from Postgres.

import { supabase } from '@/lib/supabaseClient';

// Storage keys are built from the filename the browser hands us, but real
// filenames are unpredictable — a macOS screenshot's "...at 1.38.27 AM.png"
// has a narrow no-break space (U+202F) before "AM" instead of a normal
// one, which Supabase Storage's key validator rejects outright ("Invalid
// key"), failing the upload. Rather than trying to allowlist every
// character a filename might contain (Arabic names, emoji, whatever else),
// the storage key only ever uses a random safe string plus the extension —
// the original name (any script, any character) is preserved as-is in the
// file_name column and is what's actually shown to users everywhere.
function safeStorageFileName(originalName) {
  const dotIndex = originalName.lastIndexOf('.');
  const ext = dotIndex > 0 ? originalName.slice(dotIndex).replace(/[^A-Za-z0-9.]/g, '').slice(0, 10) : '';
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}${ext}`;
}

export async function uploadAttachment({ entityType, entityId, file, uploadedBy }) {
  const path = `${entityType}/${entityId}/${safeStorageFileName(file.name)}`;

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

// A staff-sent photo/file attached to a client_messages reply (see
// app/(admin)/messages/[id]/page.jsx) — same bucket and safe-filename
// handling as the gallery-style attachments above, but no `attachments`
// table row: the URL is stored directly on the message (media_url/
// media_type, migration 131), same as an inbound WhatsApp photo already
// is by the webhook.
export async function uploadClientMessageMedia(clientId, file) {
  const path = `client-messages/${clientId}/${safeStorageFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('consult-files')
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from('consult-files').getPublicUrl(path);
  return { url: data.publicUrl, contentType: file.type, name: file.name };
}

// A pet's single profile photo (patients.profile_photo_url, migration 129)
// — set from the client app's own pet page, not the gallery-style
// attachments above. Same bucket and safe-filename handling, just its own
// path prefix and its own column to PATCH afterward.
export async function uploadPatientProfilePhoto(patientId, file) {
  const path = `patient-profile-photos/${patientId}/${safeStorageFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('consult-files')
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from('consult-files').getPublicUrl(path);

  const res = await fetch(`/api/patients/${patientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_photo_url: data.publicUrl }),
  });
  const patient = await res.json();
  if (!res.ok) {
    throw new Error(patient.error || 'Failed to save profile photo');
  }
  return patient;
}
