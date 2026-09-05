// lib/useIntakeReview.js
// Shared approve/reject logic for a submitted intake_requests row — used
// by both the Invite page (plain new-client/add-pet submissions) and the
// Appointment Requests panel on the Appointments page (submissions that
// asked for a slot too, reviewed there so staff can check the schedule
// before approving). See app/api/intake-requests/[id] for what the PATCH
// body actually does.

import { useState } from 'react';

export function useIntakeReview(reload) {
  const [approvalRoom, setApprovalRoom] = useState({}); // request id -> room_id chosen before approving
  const [customBooking, setCustomBooking] = useState({}); // request id -> { vetId, date, time, duration } for an 'other_surgery' request
  const [reviewing, setReviewing] = useState(null); // { id, action } currently mid approve/reject, or null
  const [reviewErrors, setReviewErrors] = useState({}); // request id -> error message, shown right on that card

  // Errors here are shown right on the card being acted on (reviewErrors)
  // rather than some shared banner elsewhere on the page — that's easy to
  // miss once you've scrolled past it, which made a real failure look
  // like the button just wasn't responding. reviewing disables both
  // buttons on that one card for the duration and shows
  // "Approving.../Rejecting...", so a slow request reads as in-progress,
  // not broken.
  async function review(id, action, clientId, request, clientName) {
    if (action === 'approve' && clientId) {
      if (!confirm(`Attach this submission's pet(s) to the existing client "${clientName || ''}" instead of creating a new one?`)) {
        return;
      }
    }
    const isCustomSurgery = request?.appointment_type === 'other_surgery';
    const custom = customBooking[id] || {};
    if (action === 'approve' && request?.appointment_type) {
      if (!approvalRoom[id]) {
        setReviewErrors({ ...reviewErrors, [id]: 'Pick a room for the requested appointment before approving' });
        return;
      }
      if (isCustomSurgery && (!custom.vetId || !custom.date || !custom.time || !custom.duration)) {
        setReviewErrors({
          ...reviewErrors,
          [id]: 'Pick a vet, date, time, and duration for this custom surgery request before approving',
        });
        return;
      }
    }
    setReviewErrors({ ...reviewErrors, [id]: null });
    setReviewing({ id, action });
    try {
      const res = await fetch(`/api/intake-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(clientId ? { client_id: clientId } : {}),
          ...(action === 'approve' && request?.appointment_type ? { room_id: approvalRoom[id] } : {}),
          ...(action === 'approve' && isCustomSurgery
            ? {
                vet_id: custom.vetId,
                start_time: new Date(`${custom.date}T${custom.time}:00`).toISOString(),
                duration_minutes: Number(custom.duration),
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setReviewErrors({ ...reviewErrors, [id]: data?.error || `Failed to ${action} this request` });
        return;
      }
      reload?.();
    } catch (err) {
      setReviewErrors({ ...reviewErrors, [id]: err.message || `Failed to ${action} this request — check your connection and try again` });
    } finally {
      setReviewing(null);
    }
  }

  return { approvalRoom, setApprovalRoom, customBooking, setCustomBooking, reviewing, reviewErrors, review };
}
