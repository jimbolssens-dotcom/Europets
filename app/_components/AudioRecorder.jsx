// app/_components/AudioRecorder.jsx
// Record ambient audio for a consult, surgery, or hospitalization
// worksheet entry, upload it, and show transcription/summary progress.
// Once AssemblyAI + Claude finish (via a webhook), the summary is folded
// into the relevant record automatically — this just surfaces status and
// the result. For entityType "hospitalization" there's no existing row
// to write to (the worksheet entry is an unsaved draft form) — the
// webhook stores its extraction on the recording itself instead, and
// `onExtractedFields` reports it here so the page can fill in that
// draft's still-empty fields.

'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { uploadRecording, recordingUrl } from '@/lib/recordings';

const STATUS_LABEL = {
  processing: 'Transcribing & summarizing...',
  done: 'Done',
  error: 'Failed',
};

export default function AudioRecorder({ entityType, entityId, onExtractedFields }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState({});
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  // Recordings already finished as of the initial load (or already
  // reported) — so onExtractedFields only fires for a recording that
  // finishes while this page is open, not every past one on every mount.
  const seenDoneIdsRef = useRef(null);

  const load = () =>
    fetch(`/api/recordings?entity_type=${entityType}&entity_id=${entityId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setItems(list);

        if (seenDoneIdsRef.current === null) {
          seenDoneIdsRef.current = new Set(list.filter((r) => r.status !== 'processing').map((r) => r.id));
          return;
        }
        if (!onExtractedFields) return;
        for (const r of list) {
          if (r.status === 'done' && r.extracted_fields && !seenDoneIdsRef.current.has(r.id)) {
            seenDoneIdsRef.current.add(r.id);
            onExtractedFields(r.extracted_fields);
          }
        }
      });

  useEffect(() => {
    seenDoneIdsRef.current = null;
    load();
    const channel = supabase
      .channel(`recordings-${entityType}-${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recordings', filter: `entity_id=eq.${entityId}` },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          await uploadRecording({ entityType, entityId, blob });
          load();
        } catch (err) {
          setError(err.message);
        }
        setUploading(false);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch (err) {
      setError('Could not access microphone: ' + err.message);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function removeRecording(id) {
    if (!confirm('Delete this recording?')) return;
    await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="recorder">
      {error && <p className="error">{error}</p>}
      <div className="recorder-controls">
        {!recording ? (
          <button type="button" onClick={startRecording} disabled={uploading}>
            {uploading ? 'Uploading...' : '● Start Recording'}
          </button>
        ) : (
          <button type="button" className="recorder-stop" onClick={stopRecording}>
            <span className="recorder-dot" /> Stop Recording
          </button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="recorder-list">
          {items.map((r) => (
            <li key={r.id}>
              <div className="recorder-item-header">
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <span className={`recorder-status recorder-status-${r.status}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
                <button type="button" onClick={() => removeRecording(r.id)}>
                  Remove
                </button>
              </div>
              <audio controls src={recordingUrl(r.file_path)} style={{ width: '100%' }} />
              {r.status === 'error' && r.error_message && (
                <p className="error">{r.error_message}</p>
              )}
              {r.status === 'done' && r.summary && (
                <div className="recorder-summary">
                  <strong>
                    {entityType === 'visit' || entityType === 'hospitalization'
                      ? 'AI summary (fields below were filled in automatically)'
                      : 'AI summary'}
                  </strong>
                  <p>{r.summary}</p>
                  <button
                    type="button"
                    onClick={() => setExpanded({ ...expanded, [r.id]: !expanded[r.id] })}
                  >
                    {expanded[r.id] ? 'Hide transcript' : 'Show full transcript'}
                  </button>
                  {expanded[r.id] && <p className="recorder-transcript">{r.transcript}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
