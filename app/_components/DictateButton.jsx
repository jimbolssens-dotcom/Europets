// app/_components/DictateButton.jsx
// 🎙️ in a client chat's reply box (app/(admin)/messages/[id],
// app/mobile/messages/[id]): tap, say the reply, tap ⏹. It's transcribed
// and written up by the AI (POST /api/clients/:id/dictate) and put in the
// reply box to review, edit and send as usual; "Exact words" swaps in what
// was actually said. Nothing is sent until staff press Send.

'use client';

import { useRef, useState } from 'react';
import { uploadClientMessageMedia } from '@/lib/attachments';

export default function DictateButton({ clientId, current, onDraft, disabled }) {
  const [state, setState] = useState(null); // 'rec' | 'working' | null
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null); // { transcript, draft, note, shown, before }
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const btnRef = useRef(null);

  // Puts the text in the reply box and makes the box tall enough to read
  // it all before sending.
  function fill(text) {
    onDraft(text);
    requestAnimationFrame(() => {
      const box = btnRef.current?.closest('form')?.querySelector('textarea');
      if (!box) return;
      box.style.height = 'auto';
      box.style.height = `${Math.min(box.scrollHeight + 4, 220)}px`;
      box.focus();
    });
  }

  if (!clientId) return null;

  async function start() {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        recRef.current = null;
        const mime = rec.mimeType || type || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) return setState(null);
        setState('working');
        try {
          const file = new File([blob], `dictation-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime });
          const up = await uploadClientMessageMedia(clientId, file);
          const res = await fetch(`/api/clients/${clientId}/dictate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_url: up.url }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not turn that into a message.');
          const before = String(current || '').trim();
          const join = (t) => (before ? `${before}\n${t}` : t);
          setResult({ ...data, shown: 'draft', before });
          fill(join(data.draft));
        } catch (err) {
          setError(err.message);
        }
        setState(null);
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setState('rec');
    } catch {
      setError("The microphone isn't available. Allow it in the browser and try again.");
    }
  }

  function toggleVersion() {
    if (!result) return;
    const next = result.shown === 'draft' ? 'transcript' : 'draft';
    const text = next === 'draft' ? result.draft : result.transcript;
    fill(result.before ? `${result.before}\n${text}` : text);
    setResult({ ...result, shown: next });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`dictate-btn${state === 'rec' ? ' dictate-rec' : ''}`}
        onClick={() => (state === 'rec' ? recRef.current?.stop() : start())}
        disabled={disabled || state === 'working'}
        title="Say your reply: the AI writes it up for you to check and send"
        aria-label={state === 'rec' ? 'Stop dictating' : 'Dictate a reply'}
      >
        {state === 'rec' ? `⏹ ${seconds}s` : state === 'working' ? '✨…' : '🎙️'}
      </button>
      {(result || error) && (
        <div className="dictate-note">
          {error ? (
            <span className="error">{error}</span>
          ) : (
            <>
              <span>{result.note || (result.shown === 'draft' ? '✨ Written up from your dictation. Check it, then Send.' : 'Your exact words. Check them, then Send.')}</span>
              {result.draft !== result.transcript && (
                <button type="button" className="dictate-swap" onClick={toggleVersion}>
                  {result.shown === 'draft' ? 'Exact words' : '✨ AI version'}
                </button>
              )}
            </>
          )}
          <button type="button" className="dictate-swap" onClick={() => { setResult(null); setError(null); }} aria-label="Hide">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
