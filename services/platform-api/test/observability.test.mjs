import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetric, bucketStart, ATTRIBUTION } from '../src/services/observability/metricContract.js';
import { emitMetric, getRecentCounters, __resetAggregatorForTests } from '../src/services/observability/aggregator.js';
import { laneDecision } from '../src/services/queue/lanes.js';
import { recordLaneDecision, getLaneStats, __resetLaneStatsForTests } from '../src/services/queue/laneStats.js';
import { recommendLoadLevel } from '../src/services/capacity/loadLevel.js';

test('metric contract normalizes required fields', () => {
  const m = normalizeMetric({
    service_name: 'platform_api',
    metric_name: 'request_count',
    metric_value: '3',
    tenant_id: null,
  });
  assert.equal(m.service_name, 'platform_api');
  assert.equal(m.metric_value, 3);
  assert.equal(m.attribution, ATTRIBUTION.MEASURED);
  assert.ok(m.timestamp);
});

test('bucketStart aligns to minute', () => {
  const d = bucketStart(Date.parse('2026-01-01T12:34:56.000Z'), 60);
  assert.equal(d.toISOString(), '2026-01-01T12:34:00.000Z');
});

test('aggregator emit is safe and countable', () => {
  __resetAggregatorForTests();
  emitMetric({ service_name: 'platform_api', metric_name: 'request_count', metric_value: 1 });
  emitMetric({ service_name: 'platform_api', metric_name: 'request_count', metric_value: 1 });
  const c = getRecentCounters('platform_api', 'request_count', 60_000);
  assert.equal(c.sum, 2);
});

test('laneDecision never defers P0/P1', () => {
  const p0 = laneDecision('heartbeat', { loadLevel: 'L4' });
  const p1 = laneDecision('violation.ingest', { loadLevel: 'L4' });
  const p3 = laneDecision('snapshot.upload', { loadLevel: 'L4' });
  assert.equal(p0.allow, true);
  assert.equal(p1.allow, true);
  assert.equal(p3.allow, false);
  assert.equal(p3.deferred, true);
});

test('lane stats record decisions', () => {
  __resetLaneStatsForTests();
  recordLaneDecision('P2', { allow: false, deferred: true, tenantId: 't1' });
  const s = getLaneStats();
  assert.equal(s.lanes.P2.deferred, 1);
  assert.ok(s.by_tenant_sample.t1);
});

test('recommendLoadLevel escalates on latency', () => {
  assert.equal(recommendLoadLevel({ apiP95Ms: 100 }), 'L0');
  assert.equal(recommendLoadLevel({ apiP95Ms: 2200 }), 'L4');
});
