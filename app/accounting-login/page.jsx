// app/accounting-login/page.jsx
// Password gate for /accounting — deliberately outside app/(admin) so it
// renders bare, without the internal staff nav. See middleware.js and
// lib/accountingAuth.js.

'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AccountingLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/accounting-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to log in');
      setSubmitting(false);
      return;
    }

    router.push(searchParams.get('next') || '/accounting');
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ margin: '1rem auto', textAlign: 'left' }}>
      {error && <p className="error">{error}</p>}
      <input
        type="password"
        placeholder="Password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Checking...' : 'Log In'}
      </button>
    </form>
  );
}

export default function AccountingLoginPage() {
  return (
    <div className="mobile-home">
      <img src="/logo.png" alt="Europets Clinic" className="mobile-logo" />
      <h1>Accounting</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <AccountingLoginForm />
      </Suspense>
    </div>
  );
}
