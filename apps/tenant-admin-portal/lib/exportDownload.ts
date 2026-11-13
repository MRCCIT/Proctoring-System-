import { API_BASE, tenantTokens } from './api';

/** Authenticated export download (Bearer). Plain <a href> cannot send JWT. */
export async function downloadExportFile(examId: string, jobId: string, kind: string) {
  const token = tenantTokens.get();
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${API_BASE}/v1/exams/${examId}/exports/${jobId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let detail = res.statusText || 'Download failed';
    try {
      const j = (await res.json()) as { detail?: string };
      if (typeof j.detail === 'string' && j.detail) detail = j.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  if (!blob.size) throw new Error('Export file was empty');

  const ext = kind === 'xlsx' ? 'xlsx' : kind === 'pdf' ? 'pdf' : 'csv';
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `exam-${examId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
