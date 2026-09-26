'use client';

import { useState } from 'react';

// A team member with both a sensible and a funny photo — hovering (desktop)
// or a first tap (touch, where :hover never fires) flips to the funny one;
// tapping again while flipped reveals a short background blurb, if there is
// one. Someone with only a plain photo (or no photo at all) still renders
// as a normal static card — see TeamPage's own fallback for those.
export default function TeamFlipCard({ name, role, photo, photoFunny, bio }) {
  const [flipped, setFlipped] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);

  function handleActivate() {
    if (!flipped) {
      setFlipped(true);
      return;
    }
    if (bio) setBioOpen((open) => !open);
  }

  return (
    <div
      className={`card team-card flip-card${flipped ? ' is-flipped' : ''}`}
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
      {bio && <span className="bg-hint">{bioOpen ? 'Tap to close' : 'Tap again for background'}</span>}
      {bioOpen && <p className="team-bio">{bio}</p>}
    </div>
  );
}
