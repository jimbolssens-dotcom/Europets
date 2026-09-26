// app/login/page.jsx
// Gate for the whole staff app — deliberately outside app/(admin) so it
// renders bare, without the internal staff nav (which itself lives
// behind this same gate). See middleware.js and lib/staffAuth.js.
//
// A server component so it can read STAFF_LOGIN_OTP_ENABLED at request
// time (no extra API round-trip just to know which form to show) and
// pass it down to the client form below.

import { isStaffOtpEnabled } from '@/lib/staffAuth';
import LoginForm from './LoginForm';

export default function LoginPage() {
  const otpEnabled = isStaffOtpEnabled();

  return (
    <div className="mobile-home">
      <img src="/logo.png" alt="Europets Clinic" className="mobile-logo" />
      <h1>Staff Login</h1>
      <p className="visit-meta">
        {otpEnabled
          ? "We'll send a code to the clinic's WhatsApp — check the usual phone."
          : 'Enter the staff PIN to continue.'}
      </p>
      <LoginForm otpEnabled={otpEnabled} />
    </div>
  );
}
