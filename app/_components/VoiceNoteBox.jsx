// app/_components/VoiceNoteBox.jsx
// A plain record/play/remove voice note for one invoice line item — no
// transcription, no AI, just the audio itself. A fallback for when a
// treatment item's dispensing instructions weren't dictated or typed
// during the consult (see VoiceToTextButton on the consult's treatment
// plan, and instructions/voice_note_path on invoice_line_items).

'use client';

import { useRef, useState } from 'react';
import { uploadVoiceNote, voiceNoteUrl } from '@/lib/voiceNotes';

export default function VoiceNoteBox({ lineItemId, path, onUploaded, onCleared }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

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
          const newPath = await uploadVoiceNote({ lineItemId, blob });
          await onUploaded(newPath);
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

  async function remove() {
    if (!confirm('Delete this voice note?')) return;
    setUploading(true);
    await onCleared();
    setUploading(false);
  }

  if (path) {
    return (
      <div className="voice-note-box">
        <audio controls src={voiceNoteUrl(path)} />
        <button type="button" className="secondary" onClick={remove} disabled={uploading}>
          {uploading ? 'Removing...' : '🗑 Remove Voice Note'}
        </button>
      </div>
    );
  }

  return (
    <div className="voice-note-box">
      {error && <p className="error">{error}</p>}
      {!recording ? (
        <button type="button" className="secondary" onClick={startRecording} disabled={uploading}>
          {uploading ? 'Uploading...' : '🎙️ Record Voice Note'}
        </button>
      ) : (
        <button type="button" className="recorder-stop" onClick={stopRecording}>
          <span className="recorder-dot" /> Stop Recording
        </button>
      )}
    </div>
  );
}
