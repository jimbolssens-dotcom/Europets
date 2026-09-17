// app/portal/video-consult/[id]/page.jsx
// Client-facing: join a video consult. Shared as a link via WhatsApp from
// the consult page ("Send Invite via WhatsApp") — no login, the link
// itself (keyed by the visit id, same as every other portal page) is the
// access control. Keyed by visit id rather than the video_consults row's
// own id so the same link a vet sends before the room even exists still
// works once it's created.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// Same reasoning as the hospitalization/consent portal pages — a link
// that's opened once and reloaded repeatedly should never be served a
// stale cached copy.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default function VideoConsultPortalPage() {
  const { id } = useParams();
  const [visit, setVisit] = useState(null);
  const [videoConsult, setVideoConsult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/visits/${id}`, { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/visits/${id}/video-consult`, { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)),
    ]).then(([visitData, videoData]) => {
      setVisit(visitData);
      setVideoConsult(videoData);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <p className="portal-loading">Loading...</p>;
  }

  if (!visit || visit.error || !visit.is_video) {
    return (
      <div className="portal-page">
        <header className="portal-header">
          <img src="/logo.png" alt="Europets Clinic" />
        </header>
        <div className="portal-card">
          <h1>Link not found</h1>
          <p>This video consult link doesn&apos;t look right. Please check the link we sent you, or get in touch.</p>
        </div>
      </div>
    );
  }

  const vetName = visit.staff?.full_name;
  const patientName = visit.patients?.name || 'your pet';

  return (
    <div className="portal-page">
      <header className="portal-header">
        <img src="/logo.png" alt="Europets Clinic" />
        <p className="tagline">Kind, caring, and compassionate veterinary care</p>
      </header>

      <div className="portal-card">
        <h1>🎥 Video Consult</h1>
        <p className="visit-meta">
          {vetName ? `With ${vetName} — for ` : 'For '}
          {patientName}
        </p>

        {!videoConsult ? (
          <p>Your vet hasn&apos;t started the call room yet — try this link again in a moment.</p>
        ) : videoConsult.status === 'ended' ? (
          <p>This call has ended. If you still need to speak with us, please contact the clinic for a new link.</p>
        ) : !joined ? (
          <>
            <p>When you&apos;re ready, tap below to join. Your browser will ask to use your camera and microphone.</p>
            <button type="button" onClick={() => setJoined(true)}>
              Join Call
            </button>
          </>
        ) : (
          <iframe
            src={videoConsult.room_url}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="video-consult-frame"
            title="Video consult"
          />
        )}
      </div>
    </div>
  );
}
