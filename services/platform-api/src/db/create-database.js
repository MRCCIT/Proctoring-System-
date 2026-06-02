import pg from 'pg';
import '../config/loadEnv.js';

function parseDatabaseUrl(url) {
  const u = new URL(url.replace(/^postgresql:/i, 'http:'));
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port || 5432,
    database: u.pathname.replace(/^\//, ''),
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const { user, password, host, port, database } = parseDatabaseUrl(databaseUrl);
  const adminClient = new pg.Client({
    user,
    password,
    host,
    port: Number(port),
    database: 'postgres',
  });
  await adminClient.connect();
  const { rows } = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (rows.length) {
    console.log(`Database "${database}" already exists.`);
  } else {
    const safeName = database.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeName !== database) {
      throw new Error('Database name must contain only letters, numbers, and underscores');
    }
    await adminClient.query(`CREATE DATABASE ${safeName}`);
    console.log(`Database "${database}" created.`);
  }
  await adminClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
