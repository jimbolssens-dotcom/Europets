import test from 'node:test';
import assert from 'node:assert/strict';
import { clientLinksSection } from '../lib/clientLinks.js';

const app = 'https://portal.epc.vet';
const site = 'https://epc.vet';

// c55935ed, 23 to 24 Oct: "What is the update regarding tuxido" twice got
// "I've asked the team for an update" while Tuxido was staying with us.
test('a pet staying with us comes with its live updates page', () => {
  const s = clientLinksSection({ app, site, clientId: 'c1', stays: [{ name: 'Tuxido', id: 'h1' }] });
  assert.match(s, /Tuxido's live updates page .*https:\/\/portal\.epc\.vet\/portal\/hospitalization\/h1/);
  assert.match(s, /how Tuxido is doing or for an update, send this link/);
});

// 321a91f3 and c55935ed, 22 to 23 Oct: "Please send me all the bills" and
// "send me tuxido invoice" waited for staff.
test("a client on file has their app, for invoices and reports, and their payment link", () => {
  const s = clientLinksSection({ app, site, clientId: 'c1' });
  assert.match(s, /https:\/\/portal\.epc\.vet\/client-app /);
  assert.match(s, /copy of an invoice or a report/);
  assert.match(s, /https:\/\/epc\.vet\/settle-bill\/owner\/c1/);
  assert.match(s, /amount, a charge or a refund still go to staff/);
});

// 26 Oct: a client asked to book a cat and was told it wasn't on file.
test("a client's pet that isn't on file gets the registration form", () => {
  assert.match(clientLinksSection({ app, site, clientId: 'c1' }), /isn't on file yet: call send_intake_link/);
});

test('a number not on file gets the new-client form and the website, nothing of a client', () => {
  const s = clientLinksSection({ app, site });
  assert.match(s, /new-client form: call send_intake_link/);
  assert.match(s, /https:\/\/epc\.vet\/services/);
  assert.doesNotMatch(s, /client-app|settle-bill|hospitalization/);
});
