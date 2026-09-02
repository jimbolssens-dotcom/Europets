// app/(admin)/accounting/layout.js
// Wraps every /accounting page with a small logout control, since staying
// logged in on a shared clinic computer isn't ideal for the one section
// meant to be owner/accountant-only. See middleware.js.

'use client';

import { useRouter } from 'next/navigation';

export default function AccountingLayout({ children }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/accounting-login', { method: 'DELETE' });
    router.push('/accounting-login');
  }

  return (
    <div>
      <p style={{ textAlign: 'right' }}>
        <button type="button" onClick={logout}>
          🔒 Log Out of Accounting
        </button>
      </p>
      {children}
    </div>
  );
}
