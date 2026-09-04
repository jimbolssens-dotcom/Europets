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

export default function AudioRecorder({ entityType, entityId, onExtractedFields, autoStart }) {
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
  // Mirrors `items`, readable from the pagehide/unmount cleanup below without
  // that closure capturing a stale, empty array from the first render.
  const itemsRef = useRef([]);

  const load = () =>
    fetch(`/api/recordings?entity_type=${entityType}&entity_id=${entityId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        itemsRef.current = list;
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

  // Once a dictation has finished transcribing and its text has been
  // extracted into the report/consult it belongs to, the raw audio has no
  // further purpose — it's cleaned up automatically the moment the user
  // leaves this page, rather than lingering in Storage indefinitely. A
  // recording still `processing` is left alone (it's still needed) and
  // picked up next time this page is left after it finishes. Every page in
  // this app navigates with plain links (full page loads, not client-side
  // routing), so `pagehide` — not just the React unmount cleanup — is what
  // actually catches that; `keepalive` lets the requests survive the page
  // tearing down.
  useEffect(() => {
    const cleanupFinishedRecordings = () => {
      for (const r of itemsRef.current) {
        if (r.status === 'done') {
          fetch(`/api/recordings/${r.id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        }
      }
    };
    window.addEventListener('pagehide', cleanupFinishedRecordings);
    return () => {
      window.removeEventListener('pagehide', cleanupFinishedRecordings);
      cleanupFinishedRecordings();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  // Set when this card was just created via a "Dictate New ... Report"
  // button (see the consult page) — skip the extra "click Start Recording"
  // step and begin capturing immediately. Runs once on mount only; a
  // report already sitting in the database on a normal page load never
  // has autoStart set, so this never fires for it.
  useEffect(() => {
    if (autoStart) startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
