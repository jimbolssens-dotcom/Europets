// app/(admin)/messages/team/page.jsx
// Messages → 👥 Team: the clinic's team chat (app/_components/TeamChat.jsx,
// migration 219). ?g=<group> opens a group (the phone alerts link here).

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TeamChat from '@/app/_components/TeamChat';

function TeamPage() {
  const params = useSearchParams();
  return (
    <>
      <div className="page-header">
        <h1>Team</h1>
        <div className="page-header-actions">
          <a href="/messages" className="button-link social-ghost">
            💬 Clients
          </a>
        </div>
      </div>
      <TeamChat initialGroup={params.get('g')} />
    </>
  );
}

export default function TeamChatPage() {
  return (
    <Suspense fallback={null}>
      <TeamPage />
    </Suspense>
  );
}
