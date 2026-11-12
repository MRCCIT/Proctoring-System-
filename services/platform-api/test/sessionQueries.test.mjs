import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionSelectSlimSql, sessionSelectSql } from '../src/services/tenant/sessionQueries.js';

test('sessionSelectSlimSql omits heavy JSON columns', () => {
  const slim = sessionSelectSlimSql();
  assert.match(slim, /risk_score/);
  assert.match(slim, /highest_severity/);
  assert.match(slim, /violation_count/);
  assert.match(slim, /latest_snapshot_id/);
  assert.doesNotMatch(slim, /integration_metadata/);
  assert.doesNotMatch(slim, /sdk_init_meta/);
  assert.doesNotMatch(slim, /proctor_notes_json/);
});

test('sessionSelectSql includes detail JSON columns', () => {
  const full = sessionSelectSql();
  assert.match(full, /integration_metadata/);
  assert.match(full, /sdk_init_meta/);
  assert.match(full, /proctor_notes_json/);
});
