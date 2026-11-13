import assert from 'node:assert/strict';
import { riskBand } from '../src/services/tenant/proctorAssignmentEngine.js';

assert.equal(riskBand(80), 'critical');
assert.equal(riskBand(50), 'high');
assert.equal(riskBand(30), 'medium');
assert.equal(riskBand(5), 'low');
assert.equal(riskBand(70, { critical_threshold: 90, high_threshold: 60, medium_threshold: 20 }), 'high');

console.log('proctorAllocation riskBand ok');
