// app/_components/ClientReportEditor.jsx
// The AI-drafted client report (what was done + home-care instructions,
// see generateClientReport in lib/anthropicClient.js) on a surgical/
// dental report card — generated automatically once dictation finishes
// processing, shown here for the vet to review/correct before it's
// shared (see ReportShareActions). Edits are local until Save; the
// draft re-syncs from the saved value whenever there are no unsaved
// edits, so a fresh AI draft landing via realtime (dictation finishing)
// shows up here without needing a page reload.

'use client';

import { useEffect, useState } from 'react';

export default function ClientReportEditor({ reportId, apiBase, savedReport, onSaved }) {
  const [draft, setDraft] = useState(savedReport || '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dirty) setDraft(savedReport || '');
  }, [savedReport, dirty]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`${apiBase}/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_summary: draft }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Failed to save');
      return;
    }
    setDirty(false);
    onSaved?.();
  }

  if (!savedReport && !dirty) {
    return (
      <p className="visit-meta">
        The client report will appear here automatically once the dictation finishes processing.
      </p>
    );
  }

  return (
    <div className="postop-panel">
      <h4>Client Report</h4>
      {error && <p className="error">{error}</p>}
      <textarea rows={9} value={draft} onChange={(e) => { setDraft(e.target.value); setDirty(true); }} />
      <div className="home-links">
        <button type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save Edits'}
        </button>
        {dirty && <span className="share-hint">Unsaved changes — sharing uses the last saved version.</span>}
      </div>
    </div>
  );
}
