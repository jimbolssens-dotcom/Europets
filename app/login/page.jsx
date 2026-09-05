// app/login/page.jsx
// PIN gate for the whole staff app — deliberately outside app/(admin) so
// it renders bare, without the internal staff nav (which itself lives
// behind this same gate). See middleware.js and lib/staffAuth.js.

'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pincode, setPincode] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to log in');
      setSubmitting(false);
      return;
    }

    router.push(searchParams.get('next') || '/');
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ margin: '1rem auto', textAlign: 'left' }}>
      {error && <p className="error">{error}</p>}
      <input
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        autoFocus
        required
        value={pincode}
        onChange={(e) => setPincode(e.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Checking...' : 'Log In'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mobile-home">
      <img src="/logo.png" alt="Europets Clinic" className="mobile-logo" />
      <h1>Staff Login</h1>
      <p className="visit-meta">Enter the staff PIN to continue.</p>
      <Suspense fallback={<p>Loading...</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
