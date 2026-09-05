// app/_components/AppointmentRequestsPanel.jsx
// A submitted intake request that also asked for an appointment is
// reviewed here, on the Appointments page itself (just under the month
// overview, left of the schedule) rather than on the Invite page — so
// staff can glance at the day's schedule right beside it before
// approving, instead of approving blind and finding out about a clash
// only once it's already booked. A plain submission (no appointment
// request) is still reviewed on the Invite page — see IntakeReviewCard.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useIntakeReview } from '@/lib/useIntakeReview';
import { usePossibleClientMatches } from '@/lib/usePossibleClientMatches';
import IntakeReviewCard from '@/app/_components/IntakeReviewCard';

export default function AppointmentRequestsPanel({ rooms, vets, onApproved }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetch('/api/intake-requests')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRequests(list.filter((r) => r.status === 'submitted' && r.appointment_type));
        setLoading(false);
      });

  const { approvalRoom, setApprovalRoom, customBooking, setCustomBooking, reviewing, reviewErrors, review } =
    useIntakeReview(() => {
      load();
      onApproved?.();
    });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('appointment-requests-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_requests' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const possibleMatches = usePossibleClientMatches(requests);

  if (loading || requests.length === 0) return null;

  return (
    <div className="appointment-requests-panel">
      <h3>📅 Appointment Requests</h3>
      {requests.map((r) => (
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
          compact
        />
      ))}
    </div>
  );
}
