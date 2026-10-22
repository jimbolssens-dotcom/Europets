// app/_components/PayLinkPageEditor.jsx
// The client page's "✨ Page" section of the Pay link panel: a rescuer's
// personalised pay page (migration 214, lib/payLinkPages.js) for their
// personal payment link. Staff pick a photo, type one line and let the AI
// write the title and story (or write them), add the rescuer's Instagram,
// and choose what supporters see. Saving draws the cover and Story
// pictures in the clinic's social style.

'use client';

import { useState } from 'react';
import { uploadSocialFile } from '@/lib/socialUpload';

function initialForm(link, client) {
  const page = link?.page || {};
  return {
    // A page never set up starts switched on: opening this is setting one up.
    enabled: page.title || page.photo_path ? !!page.enabled : true,
    title: page.title || '',
    story: page.story || '',
    photo_path: page.photo_path || null,
    photo_url: page.photo_url || null,
    instagram_handle: page.instagram_handle || client?.instagram_handle || '',
    show_supporters: page.show_supporters ?? true,
    show_bills: page.show_bills ?? true,
  };
}

export default function PayLinkPageEditor({ clientId, client, link, onSaved }) {
  const [form, setForm] = useState(() => initialForm(link, client));
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(null); // 'photo' | 'write' | 'save'
  const [note, setNote] = useState(null);
  const page = link?.page;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('photo');
    setNote(null);
    try {
      const uploaded = await uploadSocialFile(`paypage-${clientId}`, file);
      set({ photo_path: uploaded.path, photo_url: URL.createObjectURL(file) });
    } catch (err) {
      setNote(err.message);
    }
    setBusy(null);
  }

  async function write() {
    setBusy('write');
    setNote(null);
    const res = await fetch(`/api/clients/${clientId}/pay-link/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setNote(data.error || "The AI couldn't write it. Try again.");
    set({ title: data.title, story: data.story });
  }

  async function save() {
    setBusy('save');
    setNote(null);
    const res = await fetch(`/api/clients/${clientId}/pay-link/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setNote(data.error || 'Could not save the page.');
    onSaved(data);
    const ig = data.link?.page?.instagram;
    setNote(
      `✅ Saved.${form.instagram_handle && !ig ? " Instagram posts couldn't be loaded: the account may be personal rather than business or creator, so only a Follow button shows." : ''}`
    );
  }

  return (
    <div className="pay-page-editor">
      <label className="pay-page-check">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <strong>Personalised page</strong>
        <span className="visit-meta">for a rescuer: their photo, story and Instagram</span>
      </label>

      {form.enabled && (
        <>
          <div className="pay-page-top">
            <label className="pay-page-photo">
              {form.photo_url ? <img src={page?.cover_url && form.photo_path === page.photo_path ? page.cover_url : form.photo_url} alt="" /> : <span>📷 Photo</span>}
              <input type="file" accept="image/*" onChange={pickPhoto} disabled={!!busy} />
            </label>
            <div className="pay-page-fields">
              <div className="pay-link-row">
                <input type="text" value={line} onChange={(e) => setLine(e.target.value)} placeholder="One line about the rescue" aria-label="One line about the rescue" />
                <button type="button" className="secondary" onClick={write} disabled={!!busy}>
                  {busy === 'write' ? '✨ ...' : '✨ Write'}
                </button>
              </div>
              <input type="text" value={form.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder="Title on the photo" aria-label="Title" />
              <div className="pay-link-row">
                <span className="pay-page-at">@</span>
                <input
                  type="text"
                  value={form.instagram_handle.replace(/^@/, '')}
                  onChange={(e) => set({ instagram_handle: e.target.value.replace(/[^A-Za-z0-9._]/g, '') })}
                  placeholder="their Instagram"
                  aria-label="Instagram"
                />
              </div>
            </div>
          </div>
          <textarea rows={3} value={form.story} maxLength={600} onChange={(e) => set({ story: e.target.value })} placeholder="A short story: who they are and what they do for the animals" aria-label="Story" />
          <div className="pay-link-row">
            <label className="pay-page-check">
              <input type="checkbox" checked={form.show_supporters} onChange={(e) => set({ show_supporters: e.target.checked })} /> Recent supporters
            </label>
            <label className="pay-page-check">
              <input type="checkbox" checked={form.show_bills} onChange={(e) => set({ show_bills: e.target.checked })} /> Bills paid
            </label>
          </div>
        </>
      )}

      <div className="pay-link-row">
        <button type="button" onClick={save} disabled={!!busy}>
          {busy === 'save' ? 'Saving...' : busy === 'photo' ? 'Uploading...' : 'Save page'}
        </button>
        {link?.url && page?.enabled && (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="visit-meta">
            Open the page ↗
          </a>
        )}
      </div>
      {note && <p className={note.startsWith('✅') ? 'visit-meta' : 'error'}>{note}</p>}
    </div>
  );
}
