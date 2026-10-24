import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteUrl } from '../lib/websiteUrl.js';

// 24 Oct: the pay link showed website-xi-seven-78.vercel.app/pay/aileen.
test('links we send always use epc.vet, never a vercel.app address', () => {
  assert.equal(websiteUrl({}), 'https://epc.vet');
  assert.equal(websiteUrl({ NEXT_PUBLIC_WEBSITE_URL: 'https://website-xi-seven-78.vercel.app' }), 'https://epc.vet');
  assert.equal(websiteUrl({ NEXT_PUBLIC_WEBSITE_URL: 'https://www.europetsclinic.com/' }), 'https://www.europetsclinic.com');
});
