/**
 * Hook for invite / reset emails. No SMTP provider wired yet — logs in non-production.
 */
export async function sendTenantAuthEmail({ to, subject, body, url }) {
  if (process.env.NODE_ENV === 'production' && !process.env.SMTP_URL && !process.env.RESEND_API_KEY) {
    return { sent: false, reason: 'email_not_configured' };
  }
  // eslint-disable-next-line no-console
  console.log('[tenant-auth-email]', { to, subject, url, bodyPreview: String(body || '').slice(0, 120) });
  return { sent: false, reason: 'stub' };
}
