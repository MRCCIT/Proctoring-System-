const DEFAULT_ORIGINS = [
  'http://localhost:3100',
  'http://localhost:3200',
  'http://localhost:3300',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:3200',
  'http://127.0.0.1:3300',
];

export function corsMiddleware(req, res, next) {
  const extra = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = new Set([...DEFAULT_ORIGINS, ...extra]);
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}
