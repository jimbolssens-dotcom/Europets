// app/_components/PostOpInstructionsPanel.jsx
// The owner-facing post-op instructions block on a surgical/dental report
// card: draft with AI (from the clinic's approved baseline + this report's
// own notes/AI summary), review/edit freely, save — only once saved can it
// be downloaded as a PDF or sent via WhatsApp/email. Nothing here reaches
// an owner without an explicit Save first.

'use client';

import { useState } from 'react';

export default function PostOpInstructionsPanel({ reportId, apiBase, savedInstructions, onSaved, client, patient }) {
  const [draft, setDraft] = useState(savedInstructions || '');
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`${apiBase}/${reportId}/generate-postop`, { method: 'POST' });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error || 'Failed to generate instructions');
      return;
    }
    setDraft(data.postop_instructions);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`${apiBase}/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postop_instructions: draft }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Failed to save instructions');
      return;
    }
    setDirty(false);
    onSaved?.(data.postop_instructions);
  }

  function releasePdfUrl() {
    return `${window.location.origin}${apiBase}/${reportId}/release-pdf`;
  }

  function shareViaWhatsApp() {
    const phone = (client?.phone || '').replace(/\D/g, '');
    const message = `Hi ${client?.full_name || 'there'}, here are the post-procedure care instructions for ${patient?.name || 'your pet'}: ${releasePdfUrl()}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  function shareViaEmail() {
    const subject = `${patient?.name || 'Your pet'} — Post-Procedure Care Instructions`;
    const body = `Hi ${client?.full_name || 'there'},\n\nHere are the post-procedure care instructions for ${patient?.name || 'your pet'}: ${releasePdfUrl()}\n\nPlease don't hesitate to reach out if you have any questions.`;
    window.open(`mailto:${client?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  return (
    <div className="postop-panel">
      <h4>Post-Op Instructions (for owner)</h4>
      {error && <p className="error">{error}</p>}
      <textarea
        rows={6}
        value={draft}
        placeholder="Click Generate with AI, or type instructions directly."
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
      />
      <div className="home-links">
        <button type="button" onClick={generate} disabled={generating}>
          {generating ? 'Drafting...' : '✨ Generate with AI'}
        </button>
        <button type="button" onClick={save} disabled={saving || !draft.trim()}>
          {saving ? 'Saving...' : 'Save Instructions'}
        </button>
      </div>

      {savedInstructions && (
        <>
          <div className="share-actions">
            <a className="share-btn" href={`${apiBase}/${reportId}/release-pdf`} target="_blank" rel="noreferrer">
              📄 Download PDF
            </a>
            <button type="button" className="share-btn" onClick={shareViaWhatsApp} disabled={!client?.phone}>
              💬 WhatsApp
            </button>
            <button type="button" className="share-btn" onClick={shareViaEmail} disabled={!client?.email}>
              ✉️ Email
            </button>
          </div>
          {dirty && <p className="share-hint">Download/send always use the last saved version — save your edits first.</p>}
        </>
      )}
    </div>
  );
}
