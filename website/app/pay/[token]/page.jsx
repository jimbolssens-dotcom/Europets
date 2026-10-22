// website/app/pay/[token]/page.jsx
// A client's personal payment link, and a rescuer's own page on it
// (PayLinkView.jsx): epc.vet/pay/<short name>, the address they share.

import PayLinkView from './PayLinkView';

export default function PayLinkPage() {
  return <PayLinkView />;
}
