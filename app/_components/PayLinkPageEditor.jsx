// app/_components/PayLinkPageEditor.jsx
// The client page's "✨ Page" section of the Pay link panel: a rescuer's
// personalised pay page (migrations 214, 216, 217, lib/payLinkPages.js) for
// their personal payment link, in one of two styles: the rescuer's own
// page, built from their Instagram profile, or the clinic's photo page
// (staff pick a photo; saving draws the cover and Story pictures in the
// clinic's social style). Staff pick which one their link shows; the
// clinic's own page for them (website app/rescues) is always the photo page. For both: one line and the AI writes the title and
// story, their Instagram, their links, the short link and what supporters
// see.

'use client';

import { useState } from 'react';
import { uploadSocialFile } from '@/lib/socialUpload';

function initialForm(link, client) {
  const page = link?.page || {};
  return {
    // A page never set up starts switched on: opening this is setting one up.
    enabled: page.title || page.photo_path || page.instagram_handle ? !!page.enabled : true,
    // Set up before: as it was. New: their own page, the one they share.
    style: page.title || page.photo_path || page.instagram_handle ? page.style || 'photo' : 'instagram',
    links: (page.links || []).length ? page.links.map((l) => ({ ...l })) : [{ label: '', url: '' }],
    title: page.title || '',
    story: page.story || '',
    photo_path: page.photo_path || null,
    photo_url: page.photo_url || null,
    instagram_handle: page.instagram_handle || client?.instagram_handle || '',
    show_supporters: page.show_supporters ?? true,
    show_bills: page.show_bills ?? true,
    // The short name (migration 216): epc.vet/pay/<slug>. Suggested from
    // their first name the first time.
    slug: link?.slug || (client?.full_name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, ''),
  };
}

export default function PayLinkPageEditor({ clientId, client, link, onSaved }) {
  const [form, setForm] = useState(() => initialForm(link, client));
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(null); // 'photo' | 'write' | 'save'
  const [note, setNote] = useState(null);
  const page = link?.page;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLink = (k, patch) => setForm((f) => ({ ...f, links: f.links.map((l, n) => (n === k ? { ...l, ...patch } : l)) }));

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
      body: JSON.stringify({ ...form, links: form.links.filter((l) => l.label.trim() && l.url.trim()) }),
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
        <span className="visit-meta">for a rescuer</span>
      </label>

      {form.enabled && (
        <>
          <div className="pay-page-styles" role="radiogroup" aria-label="What their link shows">
            {[
              ['instagram', '📸 Their own page', 'their Instagram, bio and links'],
              ['photo', '📷 Our photo page', 'cover and Story picture'],
            ].map(([key, label, hint]) => (
              <button key={key} type="button" role="radio" aria-checked={form.style === key} className={`pay-page-style${form.style === key ? ' pay-page-style-on' : ''}`} onClick={() => set({ style: key })}>
                <strong>{label}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </div>
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
          <div className="pay-link-row pay-page-slug">
            <span>epc.vet/pay/</span>
            <input
              type="text"
              value={form.slug}
              maxLength={30}
              onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="short-name"
              aria-label="Short link"
            />
          </div>
          <textarea rows={3} value={form.story} maxLength={600} onChange={(e) => set({ story: e.target.value })} placeholder="A short story: who they are and what they do for the animals" aria-label="Story" />
          <div className="pay-page-links">
            {form.links.map((l, k) => (
              <div key={k} className="pay-link-row">
                <input type="text" value={l.label} maxLength={40} onChange={(e) => setLink(k, { label: e.target.value })} placeholder="Button, e.g. Adopt a cat" aria-label="Link name" />
                <input type="url" value={l.url} maxLength={300} onChange={(e) => setLink(k, { url: e.target.value })} placeholder="https://..." aria-label="Link address" />
                <button type="button" className="secondary" aria-label="Remove link" onClick={() => set({ links: form.links.length > 1 ? form.links.filter((_, n) => n !== k) : [{ label: '', url: '' }] })}>
                  ✕
                </button>
              </div>
            ))}
            {form.links.length < 5 && (
              <button type="button" className="secondary pay-page-add-link" onClick={() => set({ links: [...form.links, { label: '', url: '' }] })}>
                + Link
              </button>
            )}
          </div>
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
