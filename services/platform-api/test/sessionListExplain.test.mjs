import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { config } from '../src/config/index.js';
import { sessionSelectSlimSql, SESSIONS_FROM_SQL, buildSessionFilters } from '../src/services/tenant/sessionQueries.js';

const hasDb = Boolean(config.databaseUrl);

test('session list query must not seq-scan exam_sessions', { skip: !hasDb }, async () => {
  const client = new pg.Client({ connectionString: config.databaseUrl });
  try {
    await client.connect();
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.log('SKIP: database not reachable for EXPLAIN test');
      return;
    }
    throw e;
  }
  try {
    const tenantId = '00000000-0000-0000-0000-000000000099';
    const { params, where } = buildSessionFilters(tenantId, { limit: 25 });
    const sql = `EXPLAIN (FORMAT JSON) SELECT ${sessionSelectSlimSql()} ${SESSIONS_FROM_SQL}
      WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 5`;
    const { rows } = await client.query(sql, params);
    const plan = JSON.stringify(rows[0]?.['QUERY PLAN'] || rows[0]);
    if (plan.includes('Seq Scan on exam_sessions')) {
      assert.fail('Hot session list uses Seq Scan on exam_sessions — add/verify index (tenant_id, created_at desc)');
    }
  } finally {
    await client.end();
  }
});
