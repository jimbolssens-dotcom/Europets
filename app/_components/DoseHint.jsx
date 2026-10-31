// app/_components/DoseHint.jsx
// The guideline dose under a medicine being added (Dose guidelines page,
// lib/doseGuidelines.js): picking the medicine fills in the guideline
// amount for this pet's weight through onProposed, then whatever amount is
// typed is checked against it. Amber when a little off; red when well off,
// and then a reason has to be picked before saving (reported through
// onStatus; the form adds it to the instructions).
//
// mode 'amount': the amount box is the dose (injections, and every plan
//   item, which is per administration).
// mode 'instructions': the amount is what's dispensed (a course of
//   tablets), so the dose per time goes into the instructions instead and
//   nothing is checked.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadReferenceList } from '@/lib/viewCache';
import { guidelinesFor, proposedAmount, checkDose, guidelineLine, formatAmount, NEEDS_REASON } from '@/lib/doseGuidelines';

export const DOSE_REASONS = [
  "Vet's decision",
  'Weight is out of date',
  'Billing differs from the dose given',
  'Guideline does not fit this case',
];

// Every guideline, from the saved copy first (lib/viewCache.js).
export function useDoseGuidelines() {
  const [all, setAll] = useState([]);
  useEffect(() => {
    loadReferenceList('/api/dose-guidelines', setAll);
  }, []);
  return all;
}

// The text a dose fills into the instructions: '½ tablet twice daily'.
export function doseInstructionText(amount, g) {
  if (amount == null || !g) return '';
  return [formatAmount(amount, g.dose_unit), g.frequency].filter(Boolean).join(' ');
}

// The note a reason adds to the instructions.
export const doseReasonNote = (reason) => (reason ? `[Dose outside guideline: ${reason}]` : '');

export default function DoseHint({ guidelines, goodsServiceId, species, weightKg, amount, mode = 'amount', onProposed, onStatus }) {
  const options = useMemo(() => guidelinesFor(guidelines, goodsServiceId, species), [guidelines, goodsServiceId, species]);
  const [variant, setVariant] = useState(null);
  const [reason, setReason] = useState('');
  const g = options.find((o) => (o.variant || null) === variant) || options[0] || null;

  // A new medicine: back to its first variant, no reason yet.
  useEffect(() => {
    setVariant(options[0]?.variant || null);
    setReason('');
  }, [goodsServiceId, options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fill in the guideline amount whenever the medicine, variant or weight
  // changes (not as the amount is typed, which is the point of checking).
  useEffect(() => {
    if (!g) return;
    onProposed?.(proposedAmount(g, weightKg), g);
  }, [g?.id, weightKg]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = g && mode === 'amount' ? checkDose(g, amount, weightKg) : null;
  const needsReason = Boolean(check && NEEDS_REASON.has(check.level));

  useEffect(() => {
    onStatus?.({ needsReason, reason: needsReason ? reason : '' });
  }, [needsReason, reason]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) return null;
  const level = check?.level;
  const tone = level === 'ok' ? 'ok' : level === 'high' || level === 'low' || level === 'noweight' ? 'warn' : needsReason ? 'bad' : 'info';
  const icon = { ok: '✓', warn: '!', bad: '✕', info: '💊' }[tone];
  return (
    <div className={`dose-hint dose-hint-${tone}`} role="status">
      {options.length > 1 && (
        <span className="dose-hint-variants">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={o.id === g.id ? 'on' : ''}
              onClick={() => setVariant(o.variant || null)}
            >
              {o.variant || 'default'}
            </button>
          ))}
        </span>
      )}
      <span className="dose-hint-line">
        💊 {guidelineLine(g, weightKg)}
        {mode === 'instructions' && proposedAmount(g, weightKg) != null ? ' · per dose, filled into the instructions' : ''}
      </span>
      {check && check.text && level !== 'none' && (
        <span className="dose-hint-check">
          {icon} {check.text}
          {level === 'over' && proposedAmount(g, weightKg) != null ? ` Did you mean ${formatAmount(proposedAmount(g, weightKg), g.dose_unit)}?` : ''}
        </span>
      )}
      {needsReason && (
        <select className="dose-hint-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for this dose">
          <option value="">Give anyway: pick a reason…</option>
          {DOSE_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}
    </div>
  );
}
