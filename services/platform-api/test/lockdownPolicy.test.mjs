import test from 'node:test';
import assert from 'node:assert/strict';
import { signPolicy, verifyPolicy, canonicalJson } from '../src/services/lockdown/sign.js';
import { DEFAULT_LOCKDOWN_POLICY } from '../src/services/lockdown/policy.js';
import { mapLockdownEventToViolation } from '../src/services/lockdown/eventMapping.js';

test('canonicalJson sorts keys', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('sign and verify lockdown policy', () => {
  const examId = '11111111-1111-1111-1111-111111111111';
  const { signature, signed_at } = signPolicy(DEFAULT_LOCKDOWN_POLICY, 'test-secret', examId);
  assert.ok(signature.length === 64);
  assert.equal(verifyPolicy(DEFAULT_LOCKDOWN_POLICY, signature, 'test-secret', examId, signed_at), true);
  assert.equal(verifyPolicy(DEFAULT_LOCKDOWN_POLICY, signature, 'wrong', examId, signed_at), false);
});

test('mapLockdownEventToViolation maps fullscreen exit', () => {
  const m = mapLockdownEventToViolation({ type: 'fullscreen_exit', seq: 1 });
  assert.equal(m.event_type, 'violation.fullscreen_exit');
  assert.equal(m.severity, 'flag');
});

test('heartbeat is not a violation', () => {
  assert.equal(mapLockdownEventToViolation({ type: 'heartbeat' }), null);
});
