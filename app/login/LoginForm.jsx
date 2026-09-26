'use client';

// The actual interactive login form — split out from app/login/page.jsx
// so that page can stay a server component (it needs to read
// STAFF_LOGIN_OTP_ENABLED at request time; see its own comment).
//
// Two modes, picked by the `otpEnabled` prop the server already resolved:
//   - OTP mode: "Send code" -> WhatsApps the clinic's phone -> type the
//     6-digit code. A "Use the PIN instead" link always stays visible,
//     since WhatsApp sending is one more thing that can go wrong and
//     nobody should be locked out of their own clinic by it.
//   - PIN-only mode (the default until STAFF_LOGIN_OTP_ENABLED="true"):
//     exactly the old single-field form, unchanged.

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function PincodeForm({ onSubmit, submitting, error }) {
  const [pincode, setPincode] = useState('');
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(pincode);
      }}
      style={{ margin: '1rem auto', textAlign: 'left' }}
    >
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
        {submitting ? 'Checking...' : 'Login'}
      </button>
    </form>
  );
}

function OtpForm({ onRequestCode, onSubmitCode, submitting, error, step }) {
  const [code, setCode] = useState('');

  if (step === 'request') {
    return (
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          onRequestCode();
        }}
        style={{ margin: '1rem auto', textAlign: 'left' }}
      >
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send code to clinic WhatsApp'}
        </button>
      </form>
    );
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitCode(code);
      }}
      style={{ margin: '1rem auto', textAlign: 'left' }}
    >
      {error && <p className="error">{error}</p>}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        autoFocus
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Checking...' : 'Login'}
      </button>
    </form>
  );
}

function LoginFormInner({ otpEnabled }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState(otpEnabled ? 'otp' : 'pin');
  const [step, setStep] = useState('request'); // otp mode only: 'request' | 'code'
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function finishLogin(body) {
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to log in');
      setSubmitting(false);
      return;
    }
    router.push(searchParams.get('next') || '/');
  }

  async function handleRequestCode() {
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/login/request-code', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not send the code');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setStep('code');
  }

  if (mode === 'pin') {
    return (
      <>
        <PincodeForm onSubmit={(pincode) => finishLogin({ pincode })} submitting={submitting} error={error} />
        {otpEnabled && (
          <button
            type="button"
            className="mobile-link-btn"
            onClick={() => {
              setMode('otp');
              setStep('request');
              setError(null);
            }}
          >
            Use the WhatsApp code instead
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <OtpForm
        step={step}
        onRequestCode={handleRequestCode}
        onSubmitCode={(code) => finishLogin({ code })}
        submitting={submitting}
        error={error}
      />
      <button
        type="button"
        className="mobile-link-btn"
        onClick={() => {
          setMode('pin');
          setError(null);
        }}
      >
        Having trouble? Use the PIN instead
      </button>
    </>
  );
}

export default function LoginForm({ otpEnabled }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <LoginFormInner otpEnabled={otpEnabled} />
    </Suspense>
  );
}
