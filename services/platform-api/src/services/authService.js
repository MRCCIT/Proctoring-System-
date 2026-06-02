import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { signSuperAdminToken } from '../utils/jwt.js';

export async function loginSuperAdmin(email, password) {
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name FROM superadmin_users WHERE email = $1`,
    [String(email || '').toLowerCase().trim()]
  );
  const user = rows[0];
  if (!user) {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }
  const access_token = signSuperAdminToken({ sub: user.id, email: user.email });
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: process.env.JWT_EXPIRES_IN || '8h',
    user: { id: user.id, email: user.email, display_name: user.display_name },
  };
}
