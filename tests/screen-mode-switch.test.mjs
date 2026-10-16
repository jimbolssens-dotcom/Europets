import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopPathFor, mobilePathFor, sideOf } from '../lib/screenModeSwitch.js';

test('mobile pages open their desktop twin', () => {
  assert.equal(desktopPathFor('/mobile'), '/');
  assert.equal(desktopPathFor('/mobile/messages/abc'), '/messages/abc');
  assert.equal(desktopPathFor('/mobile/consults/v1'), '/consults/v1');
  assert.equal(desktopPathFor('/mobile/day-procedures/h1/vaccination'), '/hospitalization/h1');
  assert.equal(desktopPathFor('/mobile/hospitalization/h2/checkin'), '/hospitalization/h2');
  assert.equal(desktopPathFor('/mobile/schedule'), '/appointments');
  assert.equal(desktopPathFor('/mobile/xray/r1'), '/');
});

test('desktop pages open their mobile twin', () => {
  assert.equal(mobilePathFor('/'), '/mobile');
  assert.equal(mobilePathFor('/messages/abc'), '/mobile/messages/abc');
  assert.equal(mobilePathFor('/hospitalization/h1'), '/mobile/hospitalization/h1');
  assert.equal(mobilePathFor('/hospitalization/cages'), '/mobile');
  assert.equal(mobilePathFor('/accounting'), '/mobile');
});

test('client-facing pages and wall screens are never switched', () => {
  assert.equal(sideOf('/client-app'), null);
  assert.equal(sideOf('/portal/consent/x'), null);
  assert.equal(sideOf('/login'), null);
  assert.equal(sideOf('/hospitalization/wall'), null);
  assert.equal(sideOf('/mobile/messages'), 'mobile');
  assert.equal(sideOf('/appointments'), 'desktop');
});
