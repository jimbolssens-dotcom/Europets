// app/intake/page.jsx
// Client Invites: generate a self-service link from just a phone number
// and send it over WhatsApp. The number decides which form the client
// sees — POST /api/intake-requests looks it up against existing clients;
// an unambiguous match sends the existing-client layout (their own pets,
// no owner-detail fields), anything else sends the blank new-client
// layout. Either way it lands here for review before becoming a real
// client + patient(s) / appointment — approving creates those records;
// rejecting just discards the submission.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useIntakeReview } from '@/lib/useIntakeReview';
import { usePossibleClientMatches } from '@/lib/usePossibleClientMatches';
import IntakeReviewCard from '@/app/_components/IntakeReviewCard';

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IntakePage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [quickPhone, setQuickPhone] = useState('+971 ');
  const [draftPhones, setDraftPhones] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [vets, setVets] = useState([]);

  const load = () =>
    fetch('/api/intake-requests')
      .then((res) => res.json())
      .then((data) => {
        setRequests(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  const { approvalRoom, setApprovalRoom, customBooking, setCustomBooking, reviewing, reviewErrors, review } =
    useIntakeReview(load);

  useEffect(() => {
    load();
    fetch('/api/rooms')
      .then((res) => res.json())
      .then((data) => setRooms(Array.isArray(data) ? data : []));
    fetch('/api/staff?role=vet')
      .then((res) => res.json())
      .then((data) => setVets(Array.isArray(data) ? data : []));
    const channel = supabase
      .channel('intake-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_requests' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Only plain submissions (no appointment request) are reviewed here —
  // one that also asked for a slot is reviewed on the Appointments page
  // instead, right beside the schedule, so staff can check for conflicts
  // before approving it (see AppointmentRequestsPanel).
  const plainSubmissions = requests.filter((r) => r.status === 'submitted' && !r.appointment_type);
  const possibleMatches = usePossibleClientMatches(plainSubmissions);

  function portalUrl(id) {
    return `${window.location.origin}/portal/intake/${id}`;
  }

  // A request already matched to an existing client (see POST
  // /api/intake-requests) gets a message that reflects that — no point
  // asking someone we already know for their own details again.
  function intakeMessage(id, isExistingClient) {
    return isExistingClient
      ? `Hi! Thanks for calling Europets Clinic. You can view your pet(s), add a new one, and request an appointment here: ${portalUrl(id)}`
      : `Hi! Thanks for calling Europets Clinic. Please fill in your details and your pet's details here before your visit: ${portalUrl(id)}`;
  }

  // One click does both steps: generate a fresh link (each is single-use —
  // the client fills it in once and it moves to Needs Review) and open it
  // pre-drafted in WhatsApp to the number just typed in. The number alone
  // decides new-client vs existing-client — see POST /api/intake-requests.
  async function sendNewLink() {
    const phone = quickPhone.replace(/\D/g, '');
    if (phone.length <= 3) {
      setError('Enter a phone number first');
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch('/api/intake-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent_to_phone: `+${phone}` }),
    });
    if (!res.ok) {
      setSending(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to generate an invite link');
      return;
    }
    const data = await res.json();
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(intakeMessage(data.id, Boolean(data.client_id)))}`, '_blank');
    setQuickPhone('+971 ');
    setSending(false);
    load();
  }

  async function copyLink(id) {
    await navigator.clipboard.writeText(portalUrl(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Reflects whatever's currently in that row's editable "Sent To" field —
  // if it was changed since the link was sent, save it first so the list
  // keeps showing who's actually being waited on.
  async function shareViaWhatsApp(r) {
    const raw = draftPhones[r.id] ?? r.sent_to_phone ?? '+971 ';
    const phone = raw.replace(/\D/g, '');
    if (phone.length <= 3) return;
    const normalized = `+${phone}`;
    if (normalized !== r.sent_to_phone) {
      await fetch(`/api/intake-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_phone', sent_to_phone: normalized }),
      });
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(intakeMessage(r.id, Boolean(r.client_id)))}`, '_blank');
    load();
  }

  async function cancelLink(id) {
    if (!confirm('Cancel this unused invite link?')) return;
    await fetch(`/api/intake-requests/${id}`, { method: 'DELETE' });
    load();
  }

  if (loading) return <p>Loading intake requests...</p>;

  const pending = requests.filter((r) => r.status === 'pending');
  const submitted = plainSubmissions;
  const approved = requests.filter((r) => r.status === 'approved').slice(0, 10);

  return (
    <div>
      <h1>Client Invites</h1>
      <p className="visit-meta">
        Enter a caller&apos;s number and send them a link — a fresh one is created and drafted in
        WhatsApp in one step. If the number&apos;s already registered, it automatically sends their
        existing-client link (their own pets, no need to re-enter their details); otherwise it sends
        the normal new-client form. Submissions land here for review — approving creates the
        client/patient records and books any requested appointment.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="intake-quick-send">
        <input
          type="tel"
          placeholder="Phone number"
          value={quickPhone}
          onChange={(e) => setQuickPhone(e.target.value)}
        />
        <button type="button" onClick={sendNewLink} disabled={sending}>
          {sending ? 'Sending...' : '💬 Send Invite via WhatsApp'}
        </button>
      </div>

      {pending.length > 0 && (
        <>
          <h2>Sent, Awaiting Submission</h2>
          <table>
            <thead>
              <tr>
                <th>Link</th>
                <th>Sent To</th>
                <th>Sent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" onClick={() => copyLink(r.id)}>
                      {copiedId === r.id ? 'Copied!' : '🔗 Copy Link'}
                    </button>
                    {r.client_id && (
                      <>
                        {' '}
                        <span className="visit-meta">({r.clients?.full_name || 'existing client'})</span>
                      </>
                    )}
                  </td>
                  <td>
                    <input
                      type="tel"
                      placeholder="Phone number"
                      value={draftPhones[r.id] ?? r.sent_to_phone ?? '+971 '}
                      onChange={(e) => setDraftPhones({ ...draftPhones, [r.id]: e.target.value })}
                    />
                    <button type="button" onClick={() => shareViaWhatsApp(r)}>
                      💬 WhatsApp
                    </button>
                  </td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <button type="button" onClick={() => cancelLink(r.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {submitted.length > 0 && (
        <>
          <h2>Needs Review</h2>
          <p className="visit-meta">
            A submission that also requested an appointment is reviewed on the{' '}
            <a href="/appointments">Appointments</a> page instead, next to the schedule.
          </p>
          {submitted.map((r) => (
            <IntakeReviewCard
              key={r.id}
              r={r}
              rooms={rooms}
              vets={vets}
              approvalRoom={approvalRoom}
              setApprovalRoom={setApprovalRoom}
              customBooking={customBooking}
              setCustomBooking={setCustomBooking}
              possibleMatches={possibleMatches}
              reviewing={reviewing}
              reviewErrors={reviewErrors}
              review={review}
            />
          ))}
        </>
      )}

      {approved.length > 0 && (
        <>
          <h2>Recently Approved</h2>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/clients/${r.clients?.id}`}>{r.clients?.full_name}</a>
                  </td>
                  <td>{formatDateTime(r.reviewed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {requests.length === 0 && <p className="visit-meta">No intake links yet — send one above.</p>}
    </div>
  );
}
