// app/mobile/team/page.js
// The phone app's team chat: the same chat as Messages → 👥 Team on the
// desktop (app/_components/TeamChat.jsx, migration 219).

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MobileHomeButton from '@/app/_components/MobileHomeButton';
import TeamChat from '@/app/_components/TeamChat';

function TeamPage() {
  const params = useSearchParams();
  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>👥 Team</h1>
      <TeamChat initialGroup={params.get('g')} />
    </div>
  );
}

export default function MobileTeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPage />
    </Suspense>
  );
}
