import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.API_BASE || 'http://localhost:3001';

export const options = {
  scenarios: {
    exam_pulse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.15'],
    http_req_duration: ['p(95)<2500'],
  },
};

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'health ok': (r) => r.status === 200 });
  sleep(Math.random() * 2 + 0.5);
}
