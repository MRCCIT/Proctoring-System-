import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../config/loadEnv.js';
import { query } from '../config/database.js';
import { hashApiKey } from '../utils/apiKey.js';
import { writeBuffer, identityReferenceKey } from '../storage/localStorage.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');

/** Stable local dev key — synced to DB and apps/candidate-exam-app/.env on every seed. */
const DEV_DEMO_API_KEY =
  process.env.SEED_DEMO_API_KEY || 'psk_live_dev-demo-university-local-only';

function writeCandidateExamAppEnv(apiKey) {
  const apiUrl =
    process.env.PUBLIC_API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3001';
  const envPath = path.join(repoRoot, 'apps', 'candidate-exam-app', '.env');
  fs.writeFileSync(envPath, `VITE_API_URL=${apiUrl}\nVITE_API_KEY=${apiKey}\n`, 'utf8');
  console.log('Wrote candidate exam app env:', envPath);
}

async function syncDemoTenantApiKey(tenantId) {
  const plainKey = DEV_DEMO_API_KEY;
  const keyHash = hashApiKey(plainKey);
  const prefix = plainKey.slice(0, 12);
  await query(
    `UPDATE tenants SET api_key_hash = $1, api_key_prefix = $2, updated_at = now() WHERE id = $3`,
    [keyHash, prefix, tenantId]
  );
  writeCandidateExamAppEnv(plainKey);
  return { plainKey, prefix };
}

async function ensureSuperAdmin() {
  const email = process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@proctorshield.local';
  const password = process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe!123';
  const existing = await query('SELECT id FROM superadmin_users WHERE email = $1', [email]);
  if (existing.rows.length) {
    console.log('Super admin already exists:', email);
    return { email, password };
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO superadmin_users (email, password_hash, display_name)
     VALUES ($1, $2, $3)`,
    [email, passwordHash, 'Platform Super Admin']
  );
  console.log('Super admin created:', email);
  return { email, password };
}

async function ensureDemoTenant() {
  const slug = 'demo-university';
  const { rows } = await query(`SELECT id, api_key_prefix FROM tenants WHERE slug = $1`, [slug]);
  let tenantId;
  if (rows.length) {
    tenantId = rows[0].id;
    console.log('Demo tenant already exists:', slug);
  } else {
    tenantId = crypto.randomUUID();
    const keyHash = hashApiKey(DEV_DEMO_API_KEY);
    const prefix = DEV_DEMO_API_KEY.slice(0, 12);
    await query(
      `INSERT INTO tenants (id, name, slug, status, api_key_hash, api_key_prefix, contact_email, feature_flags, quotas)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)`,
      [
        tenantId,
        'Demo University',
        slug,
        keyHash,
        prefix,
        'admin@demo.edu',
        JSON.stringify({ ai_face_detection: true, ai_audio_analysis: false }),
        JSON.stringify({ max_concurrent_sessions: 50, storage_mb: 5000 }),
      ]
    );
    console.log('Demo tenant created:', slug);
  }
  const { plainKey, prefix } = await syncDemoTenantApiKey(tenantId);
  return { tenantId, apiKey: plainKey, apiPrefix: prefix };
}

async function ensureTenantAdmin(tenantId) {
  const email = process.env.SEED_TENANT_ADMIN_EMAIL || 'admin@demo.edu';
  const password = process.env.SEED_TENANT_ADMIN_PASSWORD || 'TenantAdmin!123';
  const existing = await query(
    `SELECT id FROM tenant_users WHERE tenant_id = $1 AND lower(email) = lower($2)`,
    [tenantId, email]
  );
  if (existing.rows.length) {
    console.log('Tenant admin already exists:', email);
    return { email, password };
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO tenant_users (tenant_id, email, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4, 'admin')`,
    [tenantId, email.toLowerCase(), passwordHash, 'Org Admin']
  );
  console.log('Tenant admin created:', email);
  return { email, password };
}

async function ensureDemoExamAndSession(tenantId) {
  const { rows: examRows } = await query(`SELECT id FROM exams WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`, [
    tenantId,
  ]);
  let examId = examRows[0]?.id;
  if (!examId) {
    const ins = await query(
      `INSERT INTO exams (tenant_id, title, description, scheduling, ai_sensitivity, ai_modules, policy_template, branding)
       VALUES ($1, 'Intro Proctoring', 'Seeded exam', '{"window_start": null, "window_end": null}'::jsonb, 'normal',
         '{"face": true, "gaze": true}'::jsonb, '{"terminate_on_multiple_faces": false}'::jsonb, '{"primary_color": "#0f172a"}'::jsonb)
       RETURNING id`,
      [tenantId]
    );
    examId = ins.rows[0].id;
    console.log('Demo exam created:', examId);
  }

  const { rows: candRows } = await query(
    `SELECT id FROM candidates WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  let candidateId = candRows[0]?.id;
  if (!candidateId) {
    const ins = await query(
      `INSERT INTO candidates (tenant_id, email, name, external_ref)
       VALUES ($1, 'student@demo.edu', 'Demo Student', 'stu-001')
       RETURNING id`,
      [tenantId]
    );
    candidateId = ins.rows[0].id;
    console.log('Demo candidate created:', candidateId);
  }

  const { rows: sess } = await query(
    `SELECT id FROM exam_sessions WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  );
  let sessionId = sess[0]?.id;
  if (!sessionId) {
    const ins = await query(
      `INSERT INTO exam_sessions (tenant_id, exam_id, candidate_id, external_ref, status, started_at, bytes_egress, storage_bytes, violation_flags, country_code, recording_object_key, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, 'ext-001', 'active', now(), 1200000, 5000000, 1, 'US', 'recordings/demo-session.mkv', now(), now() + interval '2 hours')
       RETURNING id`,
      [tenantId, examId, candidateId]
    );
    sessionId = ins.rows[0].id;
    console.log('Demo active session created:', sessionId);
  } else {
    await query(
      `UPDATE exam_sessions SET exam_id = COALESCE(exam_id, $2), candidate_id = COALESCE(candidate_id, $3),
         recording_object_key = COALESCE(recording_object_key, $4), updated_at = now()
       WHERE id = $1`,
      [sessionId, examId, candidateId, 'recordings/demo-session.mkv']
    );
  }

  const { rows: ev } = await query(`SELECT COUNT(*)::int AS c FROM session_events WHERE session_id = $1`, [sessionId]);
  if (ev[0].c === 0) {
    await query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at)
       VALUES
         ($1, $2, 'face_lost', 'warn', '{"duration_ms": 1200}', now() - interval '5 minutes'),
         ($1, $2, 'multiple_faces', 'flag', '{"faces": 2}', now() - interval '2 minutes')`,
      [tenantId, sessionId]
    );
    console.log('Demo session events inserted.');
  }

  const { rows: sn } = await query(`SELECT COUNT(*)::int AS c FROM session_snapshots WHERE session_id = $1`, [sessionId]);
  if (sn[0].c === 0) {
    await query(
      `INSERT INTO session_snapshots (tenant_id, session_id, object_key, caption, violation_context, captured_at)
       VALUES ($1, $2, 'snapshots/demo-1.png', 'Possible phone in frame', '{"confidence": 0.82}', now() - interval '3 minutes')`,
      [tenantId, sessionId]
    );
    console.log('Demo snapshot inserted.');
  }

  const { rows: wh } = await query(`SELECT COUNT(*)::int AS c FROM webhooks WHERE tenant_id = $1`, [tenantId]);
  if (wh[0].c === 0) {
    await query(
      `INSERT INTO webhooks (tenant_id, target_url, events, is_active, signing_secret)
       VALUES ($1, 'https://example.com/hooks/proctorshield', ARRAY['session.started','session.ended'], true, $2)`,
      [tenantId, `whsec_${crypto.randomBytes(12).toString('base64url')}`]
    );
    console.log('Demo webhook inserted (signing_secret not printed; use POST /v1/webhooks to create a new one).');
  }

  const { rows: infra } = await query(`SELECT COUNT(*)::int AS c FROM infrastructure_snapshots`);
  if (infra[0].c === 0) {
    await query(
      `INSERT INTO infrastructure_snapshots (service_name, status, latency_ms, queue_depth, details)
       VALUES
         ('api-gateway', 'healthy', 12, 3, '{"region":"us-east-1"}'),
         ('session-worker', 'healthy', 45, 0, '{}'),
         ('ai-inference', 'degraded', 890, 120, '{"gpu_util":0.94}')`
    );
  }

  return { examId, candidateId, sessionId };
}

function findSavejReferenceImage() {
  const fromEnv = process.env.SEED_SAVEJ_IMAGE;
  const envPath = fromEnv
    ? path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(repoRoot, fromEnv)
    : null;
  const candidates = [
    envPath,
    path.join(repoRoot, 'assets', 'savej-reference.png'),
    path.join(repoRoot, 'assets', 'savej-reference.jpg'),
    path.join(repoRoot, 'assets', 'savej.png'),
    path.join(repoRoot, 'assets', 'savej.jpg'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function ensureSavejCandidate(tenantId) {
  const imagePath = findSavejReferenceImage();
  const email = 'savej@demo.edu';
  const { rows: existing } = await query(
    `SELECT id, reference_photo_key FROM candidates WHERE tenant_id = $1 AND lower(email) = lower($2)`,
    [tenantId, email]
  );
  let candidateId = existing[0]?.id;
  if (!candidateId) {
    const ins = await query(
      `INSERT INTO candidates (tenant_id, email, name, external_ref)
       VALUES ($1, $2, 'Savej', 'savej')
       RETURNING id`,
      [tenantId, email]
    );
    candidateId = ins.rows[0].id;
    console.log('Savej candidate created:', candidateId);
  }
  if (!imagePath) {
    console.warn('Savej reference image not found. Drop a file at assets/savej-reference.png to enable identity verification.');
    return candidateId;
  }
  const ext = path.extname(imagePath).slice(1).toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const key = identityReferenceKey(candidateId, ext);
  const buf = fs.readFileSync(imagePath);
  writeBuffer(key, buf);
  await query(
    `UPDATE candidates SET reference_photo_key = $1, reference_photo_mime = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4`,
    [key, mime, candidateId, tenantId]
  );
  console.log(`Savej reference photo enrolled from ${imagePath}`);
  console.log(`  storage key: ${key} (${buf.length} bytes, ${mime})`);
  console.log('  Candidate app: external_ref=savej — only this face should pass identity (ArcFace ≥62%).');
  return candidateId;
}

async function ensureDemoSdkContent(tenantId) {
  const { rows: brand } = await query(`SELECT tenant_id FROM tenant_branding WHERE tenant_id = $1`, [tenantId]);
  if (!brand.length) {
    await query(
      `INSERT INTO tenant_branding (tenant_id, primary_color, secondary_color, accent_color, organization_name, support_email, candidate_welcome_message)
       VALUES ($1, '#0f172a', '#3b82f6', '#dc2626', $2, $3, $4)`,
      [
        tenantId,
        'Demo University',
        'support@demo.edu',
        'Welcome — please complete the system check and identity verification before your exam begins.',
      ]
    );
    console.log('Demo branding inserted.');
  }
  const { rows: pol } = await query(`SELECT id FROM policy_templates WHERE tenant_id = $1`, [tenantId]);
  let policyId = pol[0]?.id;
  if (!policyId) {
    const ins = await query(
      `INSERT INTO policy_templates (tenant_id, name, description, ai_modules, ai_sensitivity, grace_period_seconds, severity_thresholds, is_default)
       VALUES ($1, 'Standard', 'Default proctoring policy', $2::jsonb, 'normal', 5, $3::jsonb, true)
       RETURNING id`,
      [
        tenantId,
        JSON.stringify({
          face_detection: true,
          multiple_faces: true,
          gaze_tracking: true,
          object_detection: true,
          audio_voice: true,
          audio_noise: true,
          keystroke: false,
          network: true,
        }),
        JSON.stringify({ warn: 1, flag: 3, terminate: 8 }),
      ]
    );
    policyId = ins.rows[0].id;
    console.log('Demo policy template inserted.');
  }
  const { rows: st } = await query(`SELECT id FROM session_templates WHERE tenant_id = $1`, [tenantId]);
  if (!st.length) {
    await query(
      `INSERT INTO session_templates (tenant_id, name, description, default_duration_minutes, default_ai_sensitivity, default_ai_modules, default_policy_template_id)
       VALUES ($1, 'Standard 60-min exam', 'Reusable template for 60-minute proctored exams', 60, 'normal', '{"face_detection":true,"gaze_tracking":true}'::jsonb, $2)`,
      [tenantId, policyId]
    );
    console.log('Demo session template inserted.');
  }
}

async function seed() {
  const sa = await ensureSuperAdmin();
  const tenant = await ensureDemoTenant();
  const ta = await ensureTenantAdmin(tenant.tenantId);
  await ensureDemoExamAndSession(tenant.tenantId);
  await ensureDemoSdkContent(tenant.tenantId);
  const savejId = await ensureSavejCandidate(tenant.tenantId);

  console.log('\n--- Seed summary ---');
  console.log('Super admin login: POST /v1/superadmin/auth/login');
  console.log('  email:', sa.email, 'password:', sa.password);
  console.log('\nTenant admin login: POST /v1/tenant/auth/login');
  console.log('  tenant_slug: demo-university');
  console.log('  email:', ta.email, 'password:', ta.password);
  console.log('\nTenant admin SDK prefix: GET /v1/tenant/sdk/credentials (JWT or X-API-Key)');
  console.log('Candidate SDK: POST /v1/sdk/sessions/init (X-API-Key only)\n');
  console.log('  Demo tenant API key (candidate app .env):', tenant.apiKey);
  console.log('  API key prefix:', tenant.apiPrefix);
  console.log('  Savej candidate id:', savejId, '(external_ref="savej")');
  console.log('');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
