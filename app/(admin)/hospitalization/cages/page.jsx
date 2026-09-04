// app/hospitalization/cages/page.jsx
// The cage layout moved onto the main Hospitalization page itself (as its
// default tab) — this route just sends any old bookmark/link there.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CageLayoutRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/hospitalization');
  }, [router]);
  return null;
}
