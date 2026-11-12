import test from 'node:test';
import assert from 'node:assert/strict';
import { planCapacity, tierFor } from '../src/services/capacity/planner.js';
import { recommendLoadLevel, canServeLiveVideo } from '../src/services/capacity/loadLevel.js';

test('tier boundaries', () => {
  assert.equal(tierFor(50), 'S');
  assert.equal(tierFor(10000), 'M');
  assert.equal(tierFor(50000), 'L');
  assert.equal(tierFor(100000), 'XL');
});

test('100k plan is XL with scaled API replicas', () => {
  const p = planCapacity(100000);
  assert.equal(p.tier, 'XL');
  assert.ok(p.replicas.api >= 80);
  assert.ok(p.replicas.ws_gateway >= 50);
});

test('load level escalates on bad metrics', () => {
  assert.equal(recommendLoadLevel({}), 'L0');
  assert.equal(recommendLoadLevel({ apiP95Ms: 600 }), 'L2');
  assert.equal(recommendLoadLevel({ apiP95Ms: 2500 }), 'L4');
  assert.equal(canServeLiveVideo('L2', { focused: true }), true);
  assert.equal(canServeLiveVideo('L3', { focused: true }), false);
});
