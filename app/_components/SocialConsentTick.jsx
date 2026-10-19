// app/_components/SocialConsentTick.jsx
// The "may we share photos of your pet?" tick on the intake form and every
// consent form, saved to the client by lib/socialConsent.js. It starts
// ticked (owners opt out by unticking it), unticked only for an owner who
// already said no.
// `staff` words it for an in-person form a staff member fills in with the
// owner there.

'use client';

export default function SocialConsentTick({ checked, onChange, staff = false }) {
  return (
    <label className="intake-pet-choice social-consent-tick">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {staff ? (
          <>📸 Owner agrees to photos and videos of their pet on our Instagram and Facebook (untick if they&apos;d rather not)</>
        ) : (
          <>
            📸 You may share photos and videos of my pet on Europets&apos; Instagram and Facebook.{' '}
            <span className="visit-meta">Only my pet&apos;s first name is used, never my details. Untick this if you&apos;d rather we didn&apos;t. You can change your mind at any time.</span>
          </>
        )}
      </span>
    </label>
  );
}
