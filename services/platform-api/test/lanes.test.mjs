import test from 'node:test';
import assert from 'node:assert/strict';
import { laneDecision } from '../src/services/queue/lanes.js';

test('P0 answer-save never deferred at L4', () => {
  const d = laneDecision('answer-save', { loadLevel: 'L4' });
  assert.equal(d.lane, 'P0');
  assert.equal(d.allow, true);
});

test('exports deferred only at severe load (L4 by default)', () => {
  const mid = laneDecision('export.csv', { loadLevel: 'L3' });
  assert.equal(mid.lane, 'P2');
  assert.equal(mid.deferred, false);

  const d = laneDecision('export.csv', { loadLevel: 'L4' });
  assert.equal(d.lane, 'P2');
  assert.equal(d.deferred, true);
});
