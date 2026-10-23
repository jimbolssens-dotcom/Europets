// app/staff/page.jsx
// Staff list + create form, with inline edit and delete. Interns are
// temporary staff (migration 223, lib/staffRoles.js): "+ Intern" adds one
// under a placeholder name if needed, with a last day after which they're
// switched off automatically.

'use client';

import { useEffect, useState } from 'react';
import { dubaiLocalDateString } from '@/lib/dubaiTime';
import { STAFF_ROLES, ROLE_NAMES, nextInternName } from '@/lib/staffRoles';

const emptyForm = { full_name: '', role: 'vet', email: '', color: '', whatsapp_phone: '', access_until: '' };

function untilLabel(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // The add form stays folded away (staff are rarely added) so it never sits over the list.
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [rowError, setRowError] = useState(null);
  const [loginCode, setLoginCode] = useState(null); // { name, code, until }: shown once
  const [logOpenId, setLogOpenId] = useState(null);
  const [logDate, setLogDate] = useState(dubaiLocalDateString());
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logResult, setLogResult] = useState(null);

  const loadStaff = () =>
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => {
        setStaff(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadStaff();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to create staff member');
    } else {
      setForm(emptyForm);
      setShowAdd(false);
      loadStaff();
    }
    setSubmitting(false);
  }

  function startEdit(member) {
    setEditingId(member.id);
    setEditForm({
      full_name: member.full_name,
      role: member.role,
      email: member.email || '',
      color: member.color || '',
      whatsapp_phone: member.whatsapp_phone || '',
      access_until: member.access_until || '',
    });
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function saveEdit(id) {
    setRowError(null);
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setRowError(data.error || 'Failed to save staff member');
    } else {
      setEditingId(null);
      loadStaff();
    }
  }

  // Their own login (migration 225): a 6-digit code, shown once here.
  async function makeLoginCode(member) {
    if (member.has_login_code && !confirm(`Make a new login code for ${member.full_name}? Their old code stops working.`)) return;
    setRowError(null);
    setLoginCode(null);
    const res = await fetch(`/api/staff/${member.id}/login-code`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setRowError(data.error || 'Could not make a login code.');
    setLoginCode({ name: member.full_name, code: data.code, until: member.access_until });
    loadStaff();
  }

  async function removeLoginCode(member) {
    if (!confirm(`Remove ${member.full_name}'s login code? It stops working at once.`)) return;
    setRowError(null);
    const res = await fetch(`/api/staff/${member.id}/login-code`, { method: 'DELETE' });
    if (!res.ok) return setRowError('Could not remove the login code.');
    setLoginCode(null);
    loadStaff();
  }

  async function deleteStaff(member) {
    if (!confirm(`Delete ${member.full_name}? This cannot be undone.`)) return;
    setRowError(null);

    const res = await fetch(`/api/staff/${member.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to delete staff member');
    } else {
      loadStaff();
    }
  }

  // The usual path for someone who's left — deleting is blocked once they
  // have any history (an appointment, a roster shift, a note), which is
  // most staff. Deactivating keeps that history intact but drops them off
  // the vet/roster pickers going forward.
  async function toggleActive(member) {
    setRowError(null);
    const res = await fetch(`/api/staff/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !member.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      setRowError(data.error || 'Failed to update staff member');
    } else {
      loadStaff();
    }
  }

  // On-demand only — nothing is precomputed or shown until a manager asks
  // for it. Opening the panel just picks a date; the actual cross-table
  // query (see lib/dailyLog.js) only runs once Generate is clicked.
  function toggleDailyLog(member) {
    if (logOpenId === member.id) {
      setLogOpenId(null);
      return;
    }
    setLogOpenId(member.id);
    setLogDate(dubaiLocalDateString());
    setLogError(null);
    setLogResult(null);
  }

  async function generateDailyLog(memberId) {
    setLogLoading(true);
    setLogError(null);
    setLogResult(null);
    const res = await fetch(`/api/staff/${memberId}/daily-log?date=${logDate}`);
    const data = await res.json().catch(() => ({}));
    setLogLoading(false);
    if (!res.ok) {
      setLogError(data.error || 'Failed to generate daily log');
      return;
    }
    setLogResult(data);
  }

  if (loading) return <p>Loading staff...</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Staff</h1>
        <div className="page-header-actions">
          <a href="/staff/roster">📅 Staff Roster</a>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setForm({ ...emptyForm, role: 'intern' });
              setShowAdd(true);
            }}
            title="Temporary staff: a placeholder name is fine, and they're switched off after their last day"
          >
            + Intern
          </button>
          <button
            type="button"
            onClick={() => {
              if (!showAdd) setForm(emptyForm);
              setShowAdd((v) => !v);
            }}
            aria-expanded={showAdd}
          >
            {showAdd ? 'Close' : '+ Add staff'}
          </button>
        </div>
      </div>
      {showAdd && (
      <form className="card" onSubmit={handleSubmit}>
        <h2>{form.role === 'intern' ? 'Add an intern' : 'Add Staff'}</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder={form.role === 'intern' ? `Name (or leave empty for "${nextInternName(staff)}")` : 'Full name'}
          required={form.role !== 'intern'}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_NAMES[r]}
            </option>
          ))}
        </select>
        <div className="staff-add-row">
          <input
            type="tel"
            placeholder="WhatsApp (team chat)"
            value={form.whatsapp_phone}
            onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
          />
          {form.role === 'intern' && (
            <label className="staff-until">
              Last day
              <input type="date" value={form.access_until} onChange={(e) => setForm({ ...form, access_until: e.target.value })} />
            </label>
          )}
        </div>
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <label>
          Appointment schedule color
          <input
            type="color"
            value={form.color || '#e6186d'}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add'}
        </button>
      </form>
      )}
      {rowError && <p className="error">{rowError}</p>}
      {loginCode && (
        <div className="card staff-login-code">
          <span>
            🔑 <strong>{loginCode.name}</strong>'s login code
          </span>
          <code>{loginCode.code}</code>
          <span className="visit-meta">
            They type it on the login page instead of the clinic PIN. It's only shown now, so give it to them.
            {loginCode.until ? ` It stops after ${untilLabel(loginCode.until)}.` : ' It works until you remove it or switch them off.'}
          </span>
          <button type="button" className="secondary" onClick={() => setLoginCode(null)}>
            Done
          </button>
        </div>
      )}
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>WhatsApp</th>
            <th>Color</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) =>
            editingId === s.id ? (
              <tr key={s.id}>
                <td>
                  <input
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_NAMES[r]}
                      </option>
                    ))}
                  </select>
                  {(editForm.role === 'intern' || editForm.access_until) && (
                    <label className="staff-until">
                      Last day
                      <input type="date" value={editForm.access_until} onChange={(e) => setEditForm({ ...editForm, access_until: e.target.value })} />
                    </label>
                  )}
                </td>
                <td>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="tel"
                    placeholder="050 123 4567"
                    title="Their WhatsApp: team chat messages reach them there"
                    value={editForm.whatsapp_phone}
                    onChange={(e) => setEditForm({ ...editForm, whatsapp_phone: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    title="Appointment schedule color"
                    value={editForm.color || '#e6186d'}
                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  />
                </td>
                <td>{s.active ? 'active' : 'inactive'}</td>
                <td>
                  <button type="button" onClick={() => saveEdit(s.id)}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <>
                <tr key={s.id} className={s.active ? '' : 'appointments-row-inactive'}>
                  <td>{s.full_name}</td>
                  <td>
                    {s.role}
                    {s.access_until && (
                      <span className={`staff-until-chip${s.access_until < dubaiLocalDateString() ? ' staff-until-ended' : ''}`}>
                        {s.access_until < dubaiLocalDateString() ? 'ended' : `until ${untilLabel(s.access_until)}`}
                      </span>
                    )}
                  </td>
                  <td>{s.email}</td>
                  <td>{s.whatsapp_phone ? `+${s.whatsapp_phone}` : <span className="visit-meta">none</span>}</td>
                  <td>
                    {s.color && (
                      <span
                        className="staff-color-swatch"
                        style={{ background: s.color }}
                        title={s.color}
                      />
                    )}
                  </td>
                  <td>{s.active ? 'active' : 'inactive'}</td>
                  <td>
                    <button type="button" onClick={() => startEdit(s)}>
                      Edit
                    </button>
                    {(s.role === 'intern' || s.has_login_code) && s.active && (
                      <button type="button" onClick={() => makeLoginCode(s)} title="Their own login code for the app, instead of the clinic PIN">
                        🔑 {s.has_login_code ? 'New code' : 'Login code'}
                      </button>
                    )}
                    {s.has_login_code && (
                      <button type="button" className="secondary" onClick={() => removeLoginCode(s)} title="Their login code stops working at once">
                        Remove code
                      </button>
                    )}
                    <button type="button" onClick={() => toggleActive(s)}>
                      {s.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => deleteStaff(s)}>
                      Delete
                    </button>
                    <button type="button" onClick={() => toggleDailyLog(s)}>
                      {logOpenId === s.id ? 'Close Log' : '📋 Daily Log'}
                    </button>
                  </td>
                </tr>
                {logOpenId === s.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="staff-daily-log">
                        <div className="staff-daily-log-controls">
                          <input
                            type="date"
                            value={logDate}
                            onChange={(e) => {
                              setLogDate(e.target.value);
                              setLogResult(null);
                            }}
                          />
                          <button type="button" onClick={() => generateDailyLog(s.id)} disabled={logLoading}>
                            {logLoading ? 'Generating...' : 'Generate'}
                          </button>
                        </div>
                        {logError && <p className="error">{logError}</p>}
                        {logResult && (
                          <>
                            <p className="visit-meta">
                              <strong>{logResult.count}</strong> item{logResult.count === 1 ? '' : 's'} logged by{' '}
                              {s.full_name} on {logResult.date}
                            </p>
                            {logResult.count === 0 ? (
                              <p className="visit-meta">Nothing logged under their name that day.</p>
                            ) : (
                              <ul className="staff-daily-log-list">
                                {logResult.entries.map((entry, i) => (
                                  <li key={i}>
                                    <span className="staff-daily-log-time">
                                      {new Date(entry.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                    {entry.description}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
