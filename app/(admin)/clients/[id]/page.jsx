// app/clients/[id]/page.jsx
// Client detail: contact info plus every patient (pet) this client owns,
// each linking through to that patient's own detail page.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AttachmentSection from '@/app/_components/AttachmentSection';
import ScanIdButton from '@/app/_components/ScanIdButton';
import { uploadAttachment } from '@/lib/attachments';

const PHONE2_LABEL_TEXT = {
  husband: 'Husband',
  wife: 'Wife',
  maid: 'Maid',
  driver: 'Driver',
  other: 'Other',
};

export default function ClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [bookingLinkError, setBookingLinkError] = useState(null);

  const load = () =>
    Promise.all([
      fetch(`/api/clients/${id}`).then((res) => res.json()),
      fetch(`/api/patients?client_id=${id}`).then((res) => res.json()),
    ]).then(([clientData, patientsData]) => {
      setClient(clientData);
      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setLoading(false);
    });

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`client-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients', filter: `client_id=eq.${id}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Generates a link scoped to this one client (see POST /api/intake-
  // requests) — the public form it opens only ever shows this client's
  // own pets, never anyone else's, and lets them pick one (or add a new
  // one) and request a consult/spay/castration slot, held for staff
  // approval like a new-client intake submission.
  async function sendBookingLink() {
    setBookingLinkError(null);
    setSendingLink(true);
    const res = await fetch('/api/intake-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, sent_to_phone: client.phone || null }),
    });
    const data = await res.json().catch(() => null);
    setSendingLink(false);
    if (!res.ok) {
      setBookingLinkError(data?.error || 'Failed to generate a booking link');
      return;
    }
    const url = `${window.location.origin}/portal/intake/${data.id}`;
    const digits = (client.phone || '').replace(/\D/g, '');
    const message = `Hi ${client.full_name}! Please pick or add your pet and request an appointment here: ${url}`;
    if (digits.length > 3) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      await navigator.clipboard.writeText(url);
      setBookingLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  async function handleScanned({ full_name, emirates_id, file }) {
    const update = {};
    if (full_name && !client.full_name) update.full_name = full_name;
    if (emirates_id) update.emirates_id = emirates_id;
    if (Object.keys(update).length > 0) {
      await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
    }
    if (file) {
      await uploadAttachment({ entityType: 'client', entityId: id, file }).catch(() => {});
    }
    load();
  }

  if (loading) return <p>Loading client...</p>;
  if (!client || client.error) return <p>Client not found.</p>;

  return (
    <div>
      <p>
        <a href="/clients">&larr; All clients</a>
      </p>
      <h1>
        {client.full_name} <span>(Client #{client.client_number})</span>
      </h1>
      <p>
        {client.phone}
        {client.phone2
          ? ` · ${client.phone2}${client.phone2_label ? ` (${PHONE2_LABEL_TEXT[client.phone2_label] || client.phone2_label})` : ''}`
          : ''}{' '}
        · {client.email}
        {client.address ? ` · ${client.address}` : ''}
        {client.emirates_id ? ` · Emirates ID: ${client.emirates_id}` : ''}
        {client.trn ? ` · TRN: ${client.trn}` : ''}
      </p>

      <p>
        <button type="button" onClick={sendBookingLink} disabled={sendingLink}>
          {sendingLink ? 'Sending...' : '📅 Send Booking Link'}
        </button>
      </p>
      {bookingLinkError && <p className="error">{bookingLinkError}</p>}

      <h2>Emirates ID</h2>
      <ScanIdButton
        label={client.emirates_id ? '📷 Re-scan Emirates ID' : '📷 Scan Emirates ID'}
        onScanned={handleScanned}
      />
      <AttachmentSection entityType="client" entityId={id} />

      <h2>Patients</h2>
      <table>
        <thead>
          <tr>
            <th>Patient #</th>
            <th>Name</th>
            <th>Species</th>
            <th>Breed</th>
            <th>Weight (kg)</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td>{p.patient_number}</td>
              <td>
                <a
                  href={`/patients/${p.id}`}
                  style={p.deceased ? { textDecoration: 'line-through' } : undefined}
                >
                  {p.name}
                </a>
              </td>
              <td>{p.species}</td>
              <td>{p.breed}</td>
              <td>{p.current_weight_kg}</td>
            </tr>
          ))}
          {patients.length === 0 && (
            <tr>
              <td colSpan={5}>No patients for this client yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p>
        <a href="/patients">Add a patient for this client &rarr;</a>
      </p>
    </div>
  );
}
