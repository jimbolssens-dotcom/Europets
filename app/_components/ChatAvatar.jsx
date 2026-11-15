// app/_components/ChatAvatar.jsx
// The round picture beside a conversation in Messages: the client's pet
// photos (two overlap when there are two), else the pet's species, else
// the client's initials. See lib/chatAvatar.js.

import { chatAvatar } from '@/lib/chatAvatar';

export default function ChatAvatar({ clientName, pets, size = 32 }) {
  const a = chatAvatar({ clientName, pets });
  const style = { '--av': `${size}px` };
  if (a.kind === 'photos') {
    return (
      <span className={`chat-avatar chat-avatar-photos${a.photos.length > 1 ? ' two' : ''}`} style={style} title={a.photos.map((p) => p.name).join(', ')}>
        {a.photos.map((p) => (
          <img key={p.src} src={p.src} alt="" loading="lazy" />
        ))}
      </span>
    );
  }
  const bg = { ...style, background: `hsl(${a.hue} 60% 92%)`, color: `hsl(${a.hue} 45% 32%)` };
  if (a.kind === 'species') {
    return (
      <span className="chat-avatar chat-avatar-icon" style={bg} title={a.name} aria-hidden="true">
        {a.icon}
      </span>
    );
  }
  return (
    <span className="chat-avatar chat-avatar-initials" style={bg} aria-hidden="true">
      {a.text}
    </span>
  );
}
