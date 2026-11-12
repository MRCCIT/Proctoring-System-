import test from 'node:test';
import assert from 'node:assert/strict';
import { signLockdownBatch, verifyLockdownBatch } from '../src/services/lockdown/sign.js';

test('lockdown batch signature rejects tampering', () => {
  const batch = {
    session_id: '11111111-1111-1111-1111-111111111111',
    policy_version: 1,
    events: [{ type: 'fullscreen_exit', seq: 1, policy_version: 1 }],
  };
  const sig = signLockdownBatch(batch, 'test-secret');
  assert.ok(verifyLockdownBatch(batch, sig, 'test-secret'));
  assert.equal(verifyLockdownBatch({ ...batch, events: [] }, sig, 'test-secret'), false);
});
