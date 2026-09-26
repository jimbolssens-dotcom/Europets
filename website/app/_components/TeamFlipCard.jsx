'use client';

import { useState } from 'react';

// A team member with both a sensible and a funny photo. Hovering (desktop)
// flips to the funny one on its own. A click/tap — on any device — flips it
// (if not already) and opens their background blurb in the same action, so
// one click is all it takes to see their story. Clicking again closes it.
export default function TeamFlipCard({ name, role, photo, photoFunny, bio }) {
  const [open, setOpen] = useState(false);

  function handleActivate() {
    setOpen((o) => !o);
  }

  return (
    <div
      className={`team-person flip-card${open ? ' is-flipped' : ''}`}
      onClick={handleActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="flip-stage">
        <div className="flip-inner">
          <div className="flip-face flip-face-front">
            <img src={photo} alt={name} className="avatar-photo" />
          </div>
          <div className="flip-face flip-face-back">
            <img src={photoFunny} alt={`${name}, having a bit more fun`} className="avatar-photo" />
          </div>
        </div>
      </div>
      <strong>{name}</strong>
      <span>{role}</span>
      {bio && <span className="bg-hint">{open ? 'Tap to close' : 'Tap for their story'}</span>}
      {open && bio && <p className="team-bio">{bio}</p>}
    </div>
  );
}
