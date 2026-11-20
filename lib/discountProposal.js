// lib/discountProposal.js
// "No free discounts: always trade" (Jim, 20 Nov), a proposal for the whole
// team, shown on the staff homepage (app/_components/DiscountProposal.jsx).
// The idea: when a client asks for a discount, we don't just take money off;
// we offer a smaller price in return for something that helps the clinic.
// Percentages are suggestions for Jim to set.

export const DISCOUNT_PROPOSAL = {
  title: 'No free discounts: always trade',
  intro:
    'When a client asks for a discount, we never just take money off. We offer a better price in return for something that helps the clinic. The client still wins, and so do we.',
  rules: [
    'Never offer a discount first. Wait to be asked.',
    'Never say "no" flat. Say: "I can\'t take it off as it is, but here is what I can do…"',
    'Always attach a condition, and say it out loud: "…if you settle today."',
    'Small and specific: one offer, one number. Not "let me see what I can do".',
    'Write the reason on the invoice (e.g. "5% off: paid on the day"), so the team and the accounts know why.',
    'Anything bigger than the amounts above needs Jim\'s OK.',
  ],
  groups: [
    {
      title: 'Pay sooner',
      emoji: '💳',
      items: [
        { offer: 'Settle the full bill today', give: 'e.g. 5% off' },
        { offer: 'Settle within 7 days of the invoice', give: 'e.g. 3% off (full price after that)' },
        { offer: 'Pay a deposit before surgery or admission', give: 'e.g. 5% off the procedure' },
        { offer: 'Clear an old balance this month', give: 'e.g. a small goodwill amount off the oldest invoice' },
      ],
    },
    {
      title: 'Commit to more care',
      emoji: '📅',
      items: [
        { offer: 'Book the next vaccine or follow-up before leaving', give: 'e.g. 10% off that next visit' },
        { offer: 'Take a bundle (vaccines + check-up + deworming, or dental + bloods)', give: 'a bundle price instead of a discount' },
        { offer: 'Bring two or more pets on the same visit', give: 'e.g. 10% off the second pet\'s consult' },
        { offer: 'Choose a quieter time we offer (a slow morning slot)', give: 'e.g. a small off-peak price' },
      ],
    },
    {
      title: 'Help us grow',
      emoji: '🤝',
      items: [
        { offer: 'Refer a friend who books and comes in', give: 'credit on both accounts after the friend\'s first visit' },
        { offer: 'Let us share their pet\'s story or photos on our social media (signed consent)', give: 'e.g. a free nail trim or small credit' },
        { offer: 'Rescuers: share their payment link with supporters', give: 'the supporter bonus we already run' },
      ],
    },
  ],
  avoid: [
    'Don\'t trade a discount for a good Google review. Google\'s rules forbid rewards for reviews, and it can get reviews removed. Ask for an honest review as a favour instead, with no discount attached.',
    'Don\'t discount medicines or lab tests below what they cost us.',
    'Don\'t discount a bill that is already overdue unless they settle all of it now.',
  ],
  phrases: [
    '"I can\'t lower the price as it is, but if you settle today I can take 5% off."',
    '"If we book Bella\'s next vaccine now, I can give you 10% off that visit."',
    '"Bring your friends to us: once they\'ve had their first visit, you both get credit."',
  ],
};
