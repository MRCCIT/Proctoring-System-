import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.API_BASE || 'http://localhost:3001';

export const options = {
  vus: 500,
  duration: '3m',
  thresholds: {
    http_req_failed: ['rate<0.4'],
  },
};

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'health': (r) => r.status === 200 });
  http.get(`${BASE}/health`);
  sleep(0.2);
}
