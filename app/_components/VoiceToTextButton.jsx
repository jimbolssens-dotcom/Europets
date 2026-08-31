// app/_components/VoiceToTextButton.jsx
// Small mic button for dictating a single field. Click to record, click
// again to stop — the clip is transcribed and turned into clean field text
// by /api/voice-to-text, then handed to onResult to insert into the field.

'use client';

import { useRef, useState } from 'react';

export default function VoiceToTextButton({ kind, onResult }) {
  const [state, setState] = useState('idle'); // idle, recording, processing, error
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function start() {
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
        setState('processing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'dictation.webm');
        formData.append('kind', kind);
        try {
          const res = await fetch('/api/voice-to-text', { method: 'POST', body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to transcribe');
          onResult(data.text);
          setState('idle');
        } catch (err) {
          setError(err.message);
          setState('error');
        }
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setState('recording');
    } catch (err) {
      setError('Could not access microphone');
      setState('error');
    }
  }

  function stop() {
    mediaRecorderRef.current?.stop();
  }

  return (
    <span className="voice-btn-wrap">
      <button
        type="button"
        className={`voice-btn${state === 'recording' ? ' voice-btn-recording' : ''}`}
        onClick={state === 'recording' ? stop : start}
        disabled={state === 'processing'}
        title="Dictate with AI"
      >
        {state === 'processing' ? '…' : state === 'recording' ? '⏹' : '🎤'}
      </button>
      {error && <span className="voice-btn-error">{error}</span>}
    </span>
  );
}
