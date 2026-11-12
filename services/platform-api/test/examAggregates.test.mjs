import test from 'node:test';
import assert from 'node:assert/strict';
import { examAggregateRedisKey } from '../src/services/aggregates/examAggregates.js';

test('examAggregateRedisKey is stable', () => {
  const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  assert.equal(examAggregateRedisKey(id), `exam:agg:${id}`);
});
