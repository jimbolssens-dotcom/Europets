// app/_components/AttachmentSection.jsx
// Reusable file-attachment list + uploader, used on diagnostics, surgical
// and dental reports, hospitalization notes/cases, etc. Offers a dedicated
// "Take Photo" button (opens the camera directly on phones/tablets) next
// to a regular file picker, and shows a thumbnail for image attachments.
//
// moveTargets (optional): [{ label, entityType, entityId }] — when passed,
// each attachment gets a "Move to..." picker to re-tag it onto one of
// those targets (e.g. the consult's general Photos list offers moving a
// photo onto one of this visit's diagnostics, once it's clear which test
// it belongs to). Moving just re-tags the row (see PATCH /api/attachments/
// :id) — the file itself never moves, so it disappears from this list and
// picks up wherever that target's own AttachmentSection is mounted, via
// the same realtime subscription below.

'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { uploadAttachment, attachmentUrl } from '@/lib/attachments';

function isImage(attachment) {
  return (
    attachment.content_type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(attachment.file_name || '')
  );
}

export default function AttachmentSection({
  entityType,
  entityId,
  onUploaded,
  refreshKey,
  onAttachmentsChange,
  moveTargets,
}) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const load = () =>
    fetch(`/api/attachments?entity_type=${entityType}&entity_id=${entityId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setAttachments(list);
        // Optional: lets a caller (e.g. RecordReports' diagnostics list)
        // know whether this entity has any files on file at all, so it can
        // show "done" as soon as one's attached — a test doesn't need a
        // typed/AI result once its lab document is on record.
        if (onAttachmentsChange) onAttachmentsChange(list.length);
      });

  useEffect(() => {
    load();
    // refreshKey is optional — bump it from a parent that deletes an
    // attachment on this entity from outside this component (e.g. once a
    // diagnostic photo's contents have been extracted into text — see the
    // consult page) so this list picks up the removal without a remount.

    // A photo taken on the mobile consult/hospitalization page needs to
    // show up on an already-open desktop page too, the same way a
    // recording's transcription does (see the desktop consult page's own
    // `consult-${id}` channel, which listens to visits/diagnostics/etc but
    // not attachments — so without a subscription of our own here, photos
    // just sat there until someone happened to reload the page). Guarded
    // against a duplicate mount the same way AudioRecorder is, since this
    // component is also rendered more than once for the same entity (e.g.
    // once per diagnostic row).
    const topic = `attachments-${entityType}-${entityId}`;
    const alreadySubscribed = supabase
      .getChannels()
      .some((c) => c.topic === `realtime:${topic}` && (c.state === 'joined' || c.state === 'joining'));
    if (alreadySubscribed) return;

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attachments', filter: `entity_id=eq.${entityId}` },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, refreshKey]);

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const attachment = await uploadAttachment({ entityType, entityId, file });
      load();
      if (onUploaded) await onUploaded(file, attachment);
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

  async function handleMove(id, target) {
    await fetch(`/api/attachments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: target.entityType, entity_id: target.entityId }),
    });
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
              {moveTargets?.length > 0 && (
                <select
                  className="attachment-move-select"
                  defaultValue=""
                  onChange={(e) => {
                    const target = moveTargets[Number(e.target.value)];
                    e.target.value = '';
                    if (target) handleMove(a.id, target);
                  }}
                >
                  <option value="" disabled>
                    Move to...
                  </option>
                  {moveTargets.map((t, i) => (
                    <option key={`${t.entityType}-${t.entityId}`} value={i}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="attachment-actions">
        <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
          📷 Photo
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          📎 File
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
