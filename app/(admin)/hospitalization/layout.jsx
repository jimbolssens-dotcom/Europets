'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HospitalizationLayout({ children }) {
  const pathname = usePathname();
  const onWall = pathname === '/hospitalization/wall';

  return (
    <>
      {!onWall && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.35rem' }}>
          <Link
            href="/hospitalization/wall"
            className="button-link"
            style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }}
          >
            Wall display
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
