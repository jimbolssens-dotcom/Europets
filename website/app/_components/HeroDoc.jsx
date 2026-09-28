'use client';

import { useState } from 'react';

// One hex-clipped portrait in the Home hero's honeycomb. Hovering (desktop)
// or a tap (touch, where :hover never fires) flips it to the funny photo —
// same mechanism as the Team page's flip cards, just larger and with the
// name/role caption baked into each face instead of below the card.
export default function HeroDoc({ name, role, photo, photoFunny }) {
  const [flipped, setFlipped] = useState(false);

  // Some roles carry a short label plus a longer punchline after an em
  // dash (e.g. "Big Boss — Everyone Answers to Him"). The front face only
  // shows the short label, so the tag stays small and doesn't cover the
  // photo — the punchline only appears once the tile is flipped.
  const roleShort = role.split(' — ')[0];

  if (!photo) {
    return (
      <figure className="doc">
        <span className="doc-face">
          <span className="doc-ph" aria-hidden="true">
            {name.replace('Dr.', '').trim().charAt(0)}
          </span>
          <span className="doc-tag">
            <b>{name}</b>
            <i>{role}</i>
          </span>
        </span>
      </figure>
    );
  }

  if (!photoFunny) {
    return (
      <figure className="doc">
        <span className="doc-face">
          <img src={photo} alt={name} />
          <span className="doc-tag">
            <b>{name}</b>
            <i>{role}</i>
          </span>
        </span>
      </figure>
    );
  }

  return (
    <figure
      className={`doc${flipped ? ' is-flipped' : ''}`}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFlipped((f) => !f);
        }
      }}
    >
      <span className="doc-inner">
        <span className="doc-face doc-face-front">
          <img src={photo} alt={name} />
          <span className="doc-tag">
            <b>{name}</b>
            <i>{roleShort}</i>
          </span>
        </span>
        <span className="doc-face doc-face-back">
          <img src={photoFunny} alt={`${name}, having a bit more fun`} />
          <span className="doc-tag">
            <b>{name}</b>
            <i>{role}</i>
          </span>
        </span>
      </span>
    </figure>
  );
}
