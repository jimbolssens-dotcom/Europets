// app/(admin)/social/new/page.jsx
// Staff take or pick real photos and videos for a social media post,
// straight from their phone's camera or gallery (lib/socialUpload.js), with
// one line about what happened and, optionally, the patient in them.
// "✨ Make the post" then has the AI draft the captions (lib/socialDraft.js)
// and opens the draft.

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';
import { uploadSocialFile, MAX_UPLOAD_BYTES } from '@/lib/socialUpload';

const CONSENT_LABEL = {
  yes: '✓ Owner said yes',
  no: '✕ Owner said no',
  not_asked: 'Owner not asked yet',
};

function NewSocialPostForm() {
  const router = useRouter();
  // From the week's plan ("＋ Upload for this"): which idea, shown above the form.
  const params = useSearchParams();
  const [planIdea, setPlanIdea] = useState(params.get('idea'));
  const fromDuty = params.get('duty') === 'today';
  const [idea, setIdea] = useState(null);
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [files, setFiles] = useState([]); // { file, url }
  const [story, setStory] = useState('');
  // 'photos', or 'tip': a Tip card, written by the AI from a topic and
  // drawn as a branded card, no photo needed (lib/socialLayoutPlan.js).
  const [mode, setMode] = useState('photos');
  const [patient, setPatient] = useState(null); // { id, name, species, client_id }
  const [consent, setConsent] = useState(null);
  const [ownerPets, setOwnerPets] = useState(null);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  // After a failed upload, trying again carries on with the same post and
  // skips the files that already went up, instead of starting a new, empty one.
  const postIdRef = useRef(null);
  const uploadedRef = useRef(new Map()); // preview url -> media entry

  useEffect(() => {
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data.filter((s) => s.active !== false) : []))
      .catch(() => {});
    try {
      // The phone app's own "who are you" counts too (app/mobile).
      setStaffId(localStorage.getItem('social_staff_id') || localStorage.getItem('europets_mobile_staff_id') || '');
    } catch {}
    // From today's duty push: the duty's idea, and the duty person as uploader.
    if (fromDuty) {
      fetch('/api/social-duty')
        .then((res) => res.json())
        .then((d) => {
          if (!d.duty) return;
          if (d.duty.idea) setIdea(d.duty.idea);
          if (d.duty.idea?.plan_idea) setPlanIdea(d.duty.idea.plan_idea);
          setStaffId((current) => current || d.duty.staff_id);
        })
        .catch(() => {});
    } else if (planIdea) {
      fetch('/api/social-plan')
        .then((res) => res.json())
        .then((d) => {
          const n = Number(planIdea.split(':')[1]);
          if (d.plan && d.plan.week_start === planIdea.split(':')[0] && d.plan.ideas?.[n]) setIdea(d.plan.ideas[n]);
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list) {
    const picked = [...list].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const tooBig = picked.find((f) => f.size > MAX_UPLOAD_BYTES);
    setError(tooBig ? `${tooBig.name} is over 50 MB. Trim the video or film in 1080p.` : null);
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_UPLOAD_BYTES).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  // Clear the input so the same file (or another shot) can be picked again.
  function pickFrom(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function removeFile(i) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function pickPatient(p) {
    setOwnerPets(null);
    setPatient({ id: p.id, name: p.name, species: p.species, client_id: p.client_id });
    setConsent(null);
    if (!p.client_id) return setConsent('not_asked');
    const client = await fetch(`/api/clients/${p.client_id}`).then((r) => r.json()).catch(() => null);
    const answer = client?.social_media_consent;
    setConsent(answer === true ? 'yes' : answer === false ? 'no' : 'not_asked');
  }

  async function pickClient(c) {
    setPatient(null);
    setConsent(null);
    const pets = await fetch(`/api/patients?client_id=${c.id}`).then((r) => r.json()).catch(() => []);
    setOwnerPets((Array.isArray(pets) ? pets : []).filter((p) => !p.deceased && !p.rehomed).map((p) => ({ ...p, client_id: c.id })));
  }

  async function submitTip() {
    if (!story.trim()) return setError("Type what the tip is about.");
    setError(null);
    try {
      localStorage.setItem('social_staff_id', staffId);
    } catch {}
    setStep('Starting...');
    if (!postIdRef.current) {
      const created = await fetch('/api/social-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, created_by: staffId || null, plan_idea: idea && planIdea ? planIdea : null }),
      });
      const post = await created.json().catch(() => ({}));
      if (!created.ok) {
        setStep(null);
        return setError(post.error || 'Could not start the post.');
      }
      postIdRef.current = post.id;
    }
    const postId = postIdRef.current;
    await fetch(`/api/social-posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story, layout: { kind: 'tip', items: [], title: '', points: [] } }),
    });
    setStep('✨ Writing the tip...');
    const drafted = await fetch(`/api/social-posts/${postId}/draft`, { method: 'POST' });
    if (!drafted.ok) {
      const data = await drafted.json().catch(() => ({}));
      alert(data.error || 'The AI could not write this one. Open it and tap Redo.');
    }
    router.push(`/social/${postId}`);
  }

  async function submit(e) {
    e.preventDefault();
    if (mode === 'tip') return submitTip();
    if (files.length === 0) return setError('Add at least one photo or video.');
    if (consent === 'no') return setError(`${patient.name}'s owner said no to social media, so this pet can't be posted.`);
    setError(null);
    try {
      localStorage.setItem('social_staff_id', staffId);
    } catch {}

    setStep('Starting...');
    if (!postIdRef.current) {
      const created = await fetch('/api/social-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: story || idea?.title || '', patient_id: patient?.id || null, created_by: staffId || null, plan_idea: idea && planIdea ? planIdea : null }),
      });
      const post = await created.json().catch(() => ({}));
      if (!created.ok) {
        setStep(null);
        return setError(post.error || 'Could not start the post.');
      }
      postIdRef.current = post.id;
    }
    const postId = postIdRef.current;

    const media = [];
    try {
      for (let i = 0; i < files.length; i += 1) {
        setStep(`Uploading ${i + 1} of ${files.length}...`);
        if (!uploadedRef.current.has(files[i].url)) uploadedRef.current.set(files[i].url, await uploadSocialFile(postId, files[i].file));
        media.push(uploadedRef.current.get(files[i].url));
      }
    } catch (err) {
      setStep(null);
      return setError(err.message);
    }
    await fetch(`/api/social-posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media, story: story || idea?.title || '' }),
    });

    setStep('✨ Writing the post...');
    const drafted = await fetch(`/api/social-posts/${postId}/draft`, { method: 'POST' });
    if (!drafted.ok) {
      const data = await drafted.json().catch(() => ({}));
      // The files are safe on the post: open it anyway, where Redo tries again.
      alert(data.error || 'The AI could not write this one. Open it and tap Redo.');
    }
    router.push(`/social/${postId}`);
  }

  const busy = !!step;

  return (
    <div className="social-page">
      <div className="page-header">
        <h1>New post</h1>
        <div className="page-header-actions">
          <a href="/social" className="button-link social-ghost">Cancel</a>
        </div>
      </div>

      <form className="card social-card social-new" onSubmit={submit}>
        <div className="social-seg" role="tablist" aria-label="What kind of post">
          {[
            ['photos', '📷 Photos'],
            ['tip', '💡 Tip card'],
          ].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'social-seg-on' : ''} onClick={() => setMode(key)} disabled={busy}>
              {label}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        {idea && (
          <div className="social-ai">
            <strong>📅 {idea.title}</strong>
            <ul className="social-plan-shots">
              {idea.shots.map((shot) => (
                <li key={shot}>{shot}</li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'photos' && files.length > 0 && (
          <div className="social-thumbs">
            {files.map((f, i) => (
              <div key={f.url} className="social-thumb">
                {f.file.type.startsWith('video/') ? <video src={f.url} muted playsInline /> : <img src={f.url} alt="" />}
                {f.file.type.startsWith('video/') && <span className="social-thumb-badge">▶ video</span>}
                {!busy && (
                  <button type="button" className="social-thumb-remove" onClick={() => removeFile(i)} aria-label="Remove">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Camera straight from the phone (capture), or what's already in the gallery. */}
        {mode === 'photos' && (
        <div className="social-drops">
          <label className="social-drop">
            <input type="file" accept="image/*" capture="environment" onChange={pickFrom} disabled={busy} />
            📷 Photo
          </label>
          <label className="social-drop">
            <input type="file" accept="video/*" capture="environment" onChange={pickFrom} disabled={busy} />
            🎥 Video
          </label>
          <label className="social-drop">
            <input type="file" accept="image/*,video/*" multiple onChange={pickFrom} disabled={busy} />
            🖼 Gallery
          </label>
        </div>
        )}

        <label>
          <span>
            {mode === 'tip' ? "What's the tip about?" : 'What happened?'} <span className="visit-meta">One line is enough</span>
          </span>
          <textarea
            rows={2}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder={mode === 'tip' ? 'e.g. Signs your cat is in pain' : 'e.g. Home today after his dental, 3 teeth out, already eating'}
            disabled={busy}
          />
        </label>
        {mode === 'tip' && <p className="visit-meta">The AI writes a title and a few short points, drawn as a Europets card. You can change every word before approving.</p>}

        {mode === 'photos' && (
        <div className="social-field">
          <span className="social-field-label">Patient in the photos <span className="visit-meta">optional</span></span>
          {patient ? (
            <div className="social-inline">
              <span className="social-chip">🐾 {patient.name}{patient.species ? ` · ${patient.species}` : ''}</span>
              {consent && <span className={`social-chip social-consent-${consent}`}>{CONSENT_LABEL[consent]}</span>}
              {!busy && (
                <button type="button" className="social-link-button" onClick={() => { setPatient(null); setConsent(null); }}>
                  Change
                </button>
              )}
            </div>
          ) : (
            <>
              <ClientOrPatientSearch onPickPatient={pickPatient} onPickClient={pickClient} placeholder="Search the pet or owner..." />
              {ownerPets && (
                <div className="social-inline">
                  {ownerPets.length === 0 && <span className="visit-meta">No pets on file for this owner.</span>}
                  {ownerPets.map((p) => (
                    <button key={p.id} type="button" className="social-chip-button" onClick={() => pickPatient(p)}>
                      🐾 {p.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {consent === 'not_asked' && (
            <p className="social-hint">
              You can make the draft now. It can only be approved once the owner says yes: ask them, then set 📸 Social to yes on their client page.
            </p>
          )}
          <p className="visit-meta">Only the pet&apos;s first name and story are ever used. Never the owner, phone or anything private.</p>
        </div>
        )}

        <label className="social-inline-label">
          Uploaded by
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={busy}>
            <option value="">Select...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="social-primary" disabled={busy || (mode === 'photos' ? files.length === 0 : !story.trim())}>
          {step || (mode === 'tip' ? '✨ Make the tip card' : '✨ Make the post')}
        </button>
      </form>
    </div>
  );
}

// useSearchParams (the plan idea) needs a Suspense boundary in the App Router.
export default function NewSocialPostPage() {
  return (
    <Suspense fallback={<p className="visit-meta">Loading...</p>}>
      <NewSocialPostForm />
    </Suspense>
  );
}
