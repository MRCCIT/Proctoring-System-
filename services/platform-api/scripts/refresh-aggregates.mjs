import { query } from '../src/config/database.js';
import { refreshExamAggregate } from '../src/services/aggregates/examAggregates.js';

const args = process.argv.slice(2);
const examIdx = args.indexOf('--exam');
const tenantIdx = args.indexOf('--tenant');
const noRisk = args.includes('--no-risk');
const examId = examIdx >= 0 ? args[examIdx + 1] : null;
const tenantId = tenantIdx >= 0 ? args[tenantIdx + 1] : null;

const { rows } = await query(
  `SELECT id FROM exams
   WHERE ($1::uuid IS NULL OR id = $1::uuid)
     AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
   ORDER BY created_at DESC`,
  [examId, tenantId]
);

for (const r of rows) {
  const agg = await refreshExamAggregate(r.id, { updateRisk: !noRisk });
  console.log(r.id, agg ? `candidates=${agg.total_candidates} violations=${agg.total_violations}` : 'failed');
}
console.log(`Refreshed ${rows.length} exam(s)`);
process.exit(0);
