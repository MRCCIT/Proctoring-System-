'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Field, Modal } from '@proctorshield/ui-components';
import { api, type ExamRow } from '@/lib/tenantApi';
import { getClient } from '@/lib/api';

type PolicyOpt = { id: string; name: string; is_default?: boolean };
type TemplateOpt = { id: string; name: string; default_policy_template_id?: string | null };

export function ExamFormModal({
  open,
  exam,
  onClose,
  onSaved,
}: {
  open: boolean;
  exam?: Pick<ExamRow, 'id' | 'title' | 'description' | 'external_exam_id'> & {
    policy_template_id?: string | null;
    session_template_id?: string | null;
  } | null;
  onClose: () => void;
  onSaved: (exam: ExamRow) => void;
}) {
  const [title, setTitle] = useState('');
  const [externalId, setExternalId] = useState('');
  const [description, setDescription] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [policies, setPolicies] = useState<PolicyOpt[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(exam?.title || '');
    setExternalId(exam?.external_exam_id || '');
    setDescription(exam?.description || '');
    setPolicyId(exam?.policy_template_id || '');
    setTemplateId(exam?.session_template_id || '');
    setErr(null);
    setTouched(false);
    void Promise.all([getClient().listPolicyTemplates(), getClient().listSessionTemplates()])
      .then(([p, t]) => {
        setPolicies((p.data as PolicyOpt[]) || []);
        setTemplates((t.data as TemplateOpt[]) || []);
        if (!exam?.policy_template_id) {
          const def = ((p.data as PolicyOpt[]) || []).find((x) => x.is_default);
          if (def) setPolicyId(def.id);
        }
      })
      .catch((e) => setErr((e as Error).message));
  }, [open, exam]);

  const onTemplateChange = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl?.default_policy_template_id) setPolicyId(tpl.default_policy_template_id);
  };

  const save = async () => {
    setTouched(true);
    if (!title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        title: title.trim(),
        external_exam_id: externalId.trim() || null,
        description: description.trim() || null,
        policy_template_id: policyId || null,
        session_template_id: templateId || null,
      };
      const r = exam
        ? await api<{ data: ExamRow }>('PATCH', `/v1/exams/${exam.id}`, body)
        : await api<{ data: ExamRow }>('POST', '/v1/exams', body);
      onSaved(r.data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selectedPolicy = policies.find((p) => p.id === policyId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exam ? 'Edit exam' : 'New exam'}
      description="An exam groups proctoring sessions. Super Admin’s assigned services run on every attempt."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            {exam ? 'Save changes' : 'Create exam'}
          </Button>
        </>
      }
    >
      {err && <Alert tone="danger">{err}</Alert>}
      <Field label="Exam name" required error={touched && !title.trim() ? 'Exam name is required.' : null}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Organic Chemistry — Final" autoFocus />
      </Field>
      <Field
        label="External exam ID"
        hint="The ID your assessment platform uses. Sessions created through the Integration API with this ID are grouped here."
      >
        <input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="e.g. lms-course-42-final" />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional notes for reviewers" />
      </Field>
      <Field label="Session template" hint="Optional. Prefills duration defaults and can suggest a policy.">
        <select value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
          <option value="">— none —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Alert tone="info" title="Proctoring services">
        {selectedPolicy ? (
          <>
            Default pack <strong>{selectedPolicy.name}</strong> is linked automatically. Active modules always follow
            Super Admin’s allow-list.
          </>
        ) : (
          <>Sessions use your organization’s Super Admin–assigned services (no pack picker needed).</>
        )}
      </Alert>
    </Modal>
  );
}
