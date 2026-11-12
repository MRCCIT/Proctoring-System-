import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRiskScore, normalizeSeverity, severityRank } from '../src/services/risk/riskScore.js';

test('normalizeSeverity maps legacy values', () => {
  assert.equal(normalizeSeverity('flag'), 'HIGH');
  assert.equal(normalizeSeverity('warn'), 'MEDIUM');
  assert.equal(normalizeSeverity('critical'), 'CRITICAL');
});

test('dedup collapses identical events within window', () => {
  const t0 = new Date('2026-01-01T10:00:00Z');
  const t1 = new Date('2026-01-01T10:00:05Z');
  const r = computeRiskScore(
    [
      { event_type: 'ai.tab_switch', severity: 'flag', occurred_at: t0.toISOString() },
      { event_type: 'violation.tab_switch', severity: 'flag', occurred_at: t1.toISOString() },
    ],
    { dedupSeconds: 10, halfLifeSeconds: 3600, now: t1 }
  );
  assert.equal(r.counted, 1);
  assert.ok(r.score > 0);
  assert.equal(r.highest_severity, 'HIGH');
});

test('severityRank orders correctly', () => {
  assert.ok(severityRank('CRITICAL') > severityRank('HIGH'));
  assert.ok(severityRank('HIGH') > severityRank('LOW'));
});
