import { API_BASE, tenantTokens } from './api';

/** Download session integrity PDF with Bearer auth. */
export async function downloadSessionIntegrityPdf(sessionId: string, candidateName?: string | null) {
  const token = tenantTokens.get();
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${API_BASE}/v1/sessions/${sessionId}/integrity-report.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let detail = res.statusText || 'Could not generate report';
    try {
      const j = (await res.json()) as { detail?: string };
      if (typeof j.detail === 'string' && j.detail) detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  if (!blob.size) throw new Error('Report file was empty');

  const safe = (candidateName || 'session').replace(/[^\w.-]+/g, '_').slice(0, 40);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `integrity-${safe}-${sessionId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
