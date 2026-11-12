import bcrypt from 'bcryptjs';
import pg from 'pg';

const TENANT_PASSWORD = 'TenantAdmin!123';
const SUPERADMIN_PASSWORD = 'ChangeMe!123';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:15432/proctorshield';

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const tenantHash = await bcrypt.hash(TENANT_PASSWORD, 12);
const saHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);

const tenants = (
  await client.query(`SELECT id, name, slug FROM tenants ORDER BY created_at`)
).rows;

const tenantUsers = [];

for (const t of tenants) {
  const users = (
    await client.query(
      `SELECT id, email, display_name, role, status
         FROM tenant_users
        WHERE tenant_id = $1
        ORDER BY email`,
      [t.id]
    )
  ).rows;

  if (!users.length) {
    const email = `admin@${t.slug.replace(/[^a-z0-9-]/gi, '-')}.test`.toLowerCase();
    const ins = await client.query(
      `INSERT INTO tenant_users (tenant_id, email, password_hash, display_name, role, status)
       VALUES ($1, $2, $3, $4, 'admin', 'active')
       RETURNING email, display_name, role`,
      [t.id, email, tenantHash, `${t.name} Admin`]
    );
    tenantUsers.push({
      tenant: t.name,
      slug: t.slug,
      email: ins.rows[0].email,
      display_name: ins.rows[0].display_name,
      role: ins.rows[0].role,
      password: TENANT_PASSWORD,
      note: 'created',
    });
    continue;
  }

  for (const u of users) {
    await client.query(`UPDATE tenant_users SET password_hash = $1, status = 'active' WHERE id = $2`, [
      tenantHash,
      u.id,
    ]);
    tenantUsers.push({
      tenant: t.name,
      slug: t.slug,
      email: u.email,
      display_name: u.display_name,
      role: u.role,
      password: TENANT_PASSWORD,
      note: 'reset',
    });
  }
}

await client.query(`UPDATE superadmin_users SET password_hash = $1`, [saHash]);
const superadmins = (
  await client.query(`SELECT email, display_name FROM superadmin_users ORDER BY email`)
).rows.map((s) => ({
  email: s.email,
  display_name: s.display_name,
  password: SUPERADMIN_PASSWORD,
}));

console.log(JSON.stringify({ superadmins, tenantUsers }, null, 2));
await client.end();
