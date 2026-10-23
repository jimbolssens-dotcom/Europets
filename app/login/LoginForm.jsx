'use client';

// The actual interactive login form — split out from app/login/page.jsx
// so that page can stay a server component (it needs to read
// STAFF_LOGIN_OTP_ENABLED at request time; see its own comment).
//
// Two modes, picked by the `otpEnabled` prop the server already resolved,
// with no link between them — the PIN is a genuine security bypass once
// removed from view, not just a UI shortcut, so it doesn't stay reachable
// as a "having trouble?" fallback (see /api/login, which rejects a PIN
// login outright while this is on):
//   - OTP mode: "Send code" -> WhatsApps the clinic's phone -> type the
//     6-digit code. If WhatsApp sending ever breaks, recovery is
//     STAFF_LOGIN_OTP_ENABLED itself — flip it back to false in Vercel
//     and PIN-only mode returns for everyone on the next deploy.
//   - PIN-only mode (the default until STAFF_LOGIN_OTP_ENABLED="true"):
//     exactly the old single-field form, unchanged.
// In both, someone with their own login code (an intern, migration 225)
// types it instead (PIN mode: in the same field; OTP mode: "I have my own
// login code"); the app then remembers who they are on this device.

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
        placeholder="PIN or login code"
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

// Someone's own login code (migration 225), while the clinic logs in by
// WhatsApp code.
function PersonalCodeForm({ onSubmit, submitting, error }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
      style={{ margin: '1rem auto', textAlign: 'left' }}
    >
      {error && <p className="error">{error}</p>}
      <input type="password" inputMode="numeric" placeholder="Your 6-digit login code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} />
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
  const [step, setStep] = useState('request'); // otp mode only: 'request' | 'code'
  // otp mode only: typing their own login code (an intern's) instead.
  const [ownCode, setOwnCode] = useState(false);
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Failed to log in');
      setSubmitting(false);
      return;
    }
    // Their own login: every "who are you" picker starts on them.
    if (data.staff_id) {
      try {
        for (const k of ['team_staff_id', 'europets_mobile_staff_id', 'pay_link_staff_id', 'social_staff_id']) localStorage.setItem(k, data.staff_id);
      } catch {}
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

  if (!otpEnabled) {
    return <PincodeForm onSubmit={(pincode) => finishLogin({ pincode })} submitting={submitting} error={error} />;
  }

  // No "use the PIN instead" escape hatch once OTP is on — the PIN check
  // (see /api/login) is disabled at the API level while this is true, not
  // just hidden here, so there'd be nothing behind that link to actually
  // fall back to. The real fallback is STAFF_LOGIN_OTP_ENABLED itself: set
  // it back to false in Vercel and PIN-only mode returns for everyone,
  // instantly, on the next deploy — see lib/staffAuth.js's isStaffOtpEnabled.
  if (ownCode) {
    return (
      <>
        <PersonalCodeForm onSubmit={(code) => finishLogin({ personal_code: code })} submitting={submitting} error={error} />
        <button type="button" className="link-button" onClick={() => setOwnCode(false)}>
          Back to the clinic code
        </button>
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
      <button type="button" className="link-button" onClick={() => setOwnCode(true)}>
        I have my own login code
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
