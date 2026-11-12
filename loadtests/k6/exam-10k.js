import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.API_BASE || 'http://localhost:3001';

export const options = {
  scenarios: {
    ramp_10k: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 2000 },
        { duration: '8m', target: 10000 },
        { duration: '3m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.25'],
  },
};

export default function () {
  const r = http.get(`${BASE}/health`);
  check(r, { 'health': (res) => res.status === 200 });
  sleep(1 + Math.random());
}
