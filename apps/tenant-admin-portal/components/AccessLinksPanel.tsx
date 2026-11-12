'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  DataTable,
  EmptyState,
  Field,
  Modal,
  TablePagination,
  Td,
  useClientPagination,
} from '@proctorshield/ui-components';
import { api, qs, type AccessLink, type ExamRow, type Paged } from '@/lib/tenantApi';
import { formatDateTime } from '@/lib/format';

function linkState(l: AccessLink): { tone: 'success' | 'neutral' | 'danger' | 'warning'; label: string } {
  if (!l.is_active) return { tone: 'neutral', label: 'Disabled' };
  if (l.expires_at && new Date(l.expires_at) < new Date()) return { tone: 'danger', label: 'Expired' };
  if (l.max_uses && l.use_count >= l.max_uses) return { tone: 'warning', label: 'Limit reached' };
  return { tone: 'success', label: 'Active' };
}

export function AccessLinksPanel({ examId, examTitle }: { examId?: string; examTitle?: string }) {
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [form, setForm] = useState({ label: '', exam_id: examId || '', expires_in_hours: '', max_uses: '' });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<AccessLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ data: AccessLink[] }>('GET', `/v1/access-links${qs({ exam_id: examId })}`);
      setLinks(r.data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open || examId) return;
    api<Paged<ExamRow>>('GET', '/v1/exams?limit=100')
      .then((r) => setExams(r.data))
      .catch(() => {});
  }, [open, examId]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ data: AccessLink }>('POST', '/v1/access-links', {
        label: form.label.trim() || null,
        exam_id: examId || form.exam_id || null,
        expires_in_hours: form.expires_in_hours ? Number(form.expires_in_hours) : undefined,
        max_uses: form.max_uses ? Number(form.max_uses) : undefined,
      });
      setCreated(r.data);
      setOpen(false);
      setForm({ label: '', exam_id: examId || '', expires_in_hours: '', max_uses: '' });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (l: AccessLink) => {
    try {
      await api('PATCH', `/v1/access-links/${l.id}`, { is_active: !l.is_active });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const pager = useClientPagination(links, 10);

  return (
    <div>
      <div className="ps-between" style={{ marginBottom: 14 }}>
        <p className="ps-muted" style={{ margin: 0, maxWidth: 680 }}>
          Share a link when candidates join without an assessment-platform integration. Candidates enter their full name
          {examId ? '' : ' and the exam name'} and start proctoring; each start creates a session in this console.
        </p>
        <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
          New link
        </Button>
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      {created && (
        <Alert tone="success" title="Link created" onClose={() => setCreated(null)}>
          <div className="ps-secret" style={{ marginTop: 6 }}>
            <span>{created.url}</span>
            <CopyButton value={created.url} />
          </div>
        </Alert>
      )}
      <DataTable
        headers={['Link', ...(examId ? [] : ['Exam']), 'Status', 'Starts', 'Expires', 'Created', '']}
        isEmpty={!loading && links.length === 0}
        empty={<EmptyState icon="link" title="No candidate links" description="Create a link to let candidates start a proctored session themselves." />}
      >
        {pager.pageItems.map((l) => {
          const st = linkState(l);
          return (
            <tr key={l.id}>
              <Td>
                <div className="ps-cell-primary">{l.label || 'Untitled link'}</div>
                <div className="ps-cell-sub ps-mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.url}
                </div>
              </Td>
              {!examId && <Td>{l.exam_title || <span className="ps-muted">Candidate enters exam name</span>}</Td>}
              <Td>
                <Badge tone={st.tone}>{st.label}</Badge>
              </Td>
              <Td>
                {l.use_count}
                {l.max_uses ? ` / ${l.max_uses}` : ''}
              </Td>
              <Td muted nowrap>
                {l.expires_at ? formatDateTime(l.expires_at) : 'Never'}
              </Td>
              <Td muted nowrap>
                {formatDateTime(l.created_at)}
              </Td>
              <Td align="right">
                <span className="ps-row" style={{ justifyContent: 'flex-end' }}>
                  <CopyButton value={l.url} />
                  <Button size="sm" variant={l.is_active ? 'danger' : 'secondary'} onClick={() => void toggle(l)}>
                    {l.is_active ? 'Disable' : 'Enable'}
                  </Button>
                </span>
              </Td>
            </tr>
          );
        })}
      </DataTable>
      {!loading && links.length > 0 && (
        <TablePagination
          page={pager.page}
          pageSize={pager.pageSize}
          total={pager.total}
          pageCount={pager.pageCount}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New candidate link"
        description={examTitle ? `Candidates will join “${examTitle}”.` : 'Optionally bind the link to an exam; otherwise candidates type the exam name.'}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void create()}>
              Create link
            </Button>
          </>
        }
      >
        <Field label="Label" hint="Internal name, e.g. “Section B — morning sitting”.">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        {!examId && (
          <Field label="Exam" hint="Leave empty to let candidates enter the exam name (required on their side).">
            <select value={form.exam_id} onChange={(e) => setForm({ ...form, exam_id: e.target.value })}>
              <option value="">Candidate enters the exam name</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="ps-grid ps-grid-2" style={{ gap: 12 }}>
          <Field label="Expires after (hours)" hint="Empty = no expiry">
            <input type="number" min={1} value={form.expires_in_hours} onChange={(e) => setForm({ ...form, expires_in_hours: e.target.value })} />
          </Field>
          <Field label="Maximum starts" hint="Empty = unlimited">
            <input type="number" min={1} value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
