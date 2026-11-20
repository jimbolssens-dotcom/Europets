// app/_components/DiscountProposal.jsx
// The "No free discounts: always trade" proposal (lib/discountProposal.js)
// on the staff homepage, for the whole team to read (Jim, 20 Nov). Folded
// to one line until opened, so the homepage still fits a phone screen.

import { DISCOUNT_PROPOSAL as P } from '@/lib/discountProposal';

export default function DiscountProposal() {
  return (
    <details className="kind-card kind-proposal">
      <summary>
        <span className="kind-proposal-tag">Proposal</span>
        <span className="kind-proposal-title">{P.title}</span>
        <span className="kind-proposal-open">Read</span>
      </summary>
      <p className="kind-proposal-intro">{P.intro}</p>

      <div className="kind-proposal-groups">
        {P.groups.map((g) => (
          <section key={g.title} className="kind-proposal-group">
            <h3>
              <span aria-hidden="true">{g.emoji}</span> {g.title}
            </h3>
            <ul>
              {g.items.map((it) => (
                <li key={it.offer}>
                  <span className="kind-proposal-offer">{it.offer}</span>
                  <span className="kind-proposal-give">{it.give}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="kind-proposal-cols">
        <section>
          <h3>How we say it</h3>
          <ol>
            {P.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </section>
        <section>
          <h3>Try saying</h3>
          <ul className="kind-proposal-phrases">
            {P.phrases.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3>Never</h3>
          <ul className="kind-proposal-avoid">
            {P.avoid.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      </div>
      <p className="kind-proposal-foot">The amounts are suggestions until Jim confirms them. Ideas or questions? Tell Jim.</p>
    </details>
  );
}
