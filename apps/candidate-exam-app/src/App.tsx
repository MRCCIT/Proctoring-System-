import { useEffect, useMemo, useState } from 'react';
import { ExamWindow, type ExamWindowSession } from '@proctorshield/sdk/exam-window';
import { ProctorShieldClient, type CandidateBootstrap } from '@proctorshield/sdk/core';

const baseUrl = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(
  /\/$/,
  ''
);
/** Local development only: lets the demo create sessions without a tenant-issued link. */
const devApiKey = import.meta.env.DEV ? import.meta.env.VITE_API_KEY || '' : '';
const STORAGE_KEY = 'proctorshield.candidate.session';

type Entry =
  | { mode: 'launch'; token: string }
  | { mode: 'link'; token: string }
  | { mode: 'dev' }
  | { mode: 'none' };

interface ActiveSession {
  session: ExamWindowSession;
  candidateName: string;
  examTitle: string;
}

function readEntry(): Entry {
  const p = new URLSearchParams(window.location.search);
  const launch = p.get('launch');
  if (launch) return { mode: 'launch', token: launch };
  const link = p.get('link');
  if (link) return { mode: 'link', token: link };
  return devApiKey ? { mode: 'dev' } : { mode: 'none' };
}

function toActive(b: CandidateBootstrap, fallbackName = '', fallbackExam = ''): ActiveSession {
  return {
    session: { sessionId: b.session_id, sessionToken: b.session_token, wsToken: b.ws_token },
    candidateName: b.candidate_name || fallbackName,
    examTitle: b.exam?.title || fallbackExam,
  };
}

function loadStored(entryKey: string): ActiveSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ActiveSession & { entryKey: string };
    return v.entryKey === entryKey ? v : null;
  } catch {
    return null;
  }
}

function store(entryKey: string, s: ActiveSession) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, entryKey }));
}

function friendlyError(e: unknown) {
  const err = e as Error & { status?: number };
  if (err?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (err instanceof TypeError) return 'We could not reach the proctoring service. Check your internet connection and try again.';
  return err?.message || 'Something went wrong. Please try again.';
}

export default function App() {
  const entry = useMemo(readEntry, []);
  const entryKey = entry.mode === 'launch' || entry.mode === 'link' ? `${entry.mode}:${entry.token.slice(-24)}` : entry.mode;
  const publicClient = useMemo(() => new ProctorShieldClient({ baseUrl }), []);
  const [active, setActive] = useState<ActiveSession | null>(() => loadStored(entryKey));
  const [devSession, setDevSession] = useState<{ candidateName: string; examTitle: string } | null>(null);
  const [finished, setFinished] = useState(false);

  if (finished) return <Finished />;

  if (active) {
    return (
      <ExamWindow
        baseUrl={baseUrl}
        session={active.session}
        candidateName={active.candidateName}
        examTitle={active.examTitle}
        serverAi
        analyzeMinIntervalMs={150}
        continuousIdentityCheck={false}
        onSessionEnd={() => {
          sessionStorage.removeItem(STORAGE_KEY);
          setFinished(true);
        }}
      />
    );
  }

  if (devSession) {
    return (
      <ExamWindow
        baseUrl={baseUrl}
        apiKey={devApiKey}
        candidateName={devSession.candidateName}
        examTitle={devSession.examTitle}
        serverAi
        analyzeMinIntervalMs={150}
        continuousIdentityCheck={false}
        onSessionEnd={() => setFinished(true)}
      />
    );
  }

  if (entry.mode === 'launch') {
    return (
      <LaunchEntry
        client={publicClient}
        token={entry.token}
        onReady={(s) => {
          store(entryKey, s);
          setActive(s);
        }}
      />
    );
  }

  if (entry.mode === 'link') {
    return (
      <LinkEntry
        client={publicClient}
        token={entry.token}
        onReady={(s) => {
          store(entryKey, s);
          setActive(s);
        }}
      />
    );
  }

  if (entry.mode === 'dev') {
    return (
      <Shell>
        <DetailsForm
          organization="Local development"
          requireExamTitle
          note="Development mode: sessions are created with the local tenant API key. In production candidates join through a link issued by their organization."
          onSubmit={async (v) => setDevSession({ candidateName: v.candidate_name, examTitle: v.exam_title || '' })}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="card center">
        <h1>Proctoring link required</h1>
        <p className="muted">
          Open the proctoring link provided by your organization or assessment platform to begin your session.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, organization }: { children: React.ReactNode; organization?: string | null }) {
  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◆
          </span>
          <span>{organization || 'Secure proctored session'}</span>
        </div>
      </header>
      <main className="content">{children}</main>
      <footer className="footer">Protected by ProctorShield · Your session data is handled by your organization.</footer>
    </div>
  );
}

function Finished() {
  return (
    <Shell>
      <div className="card center">
        <div className="success-mark" aria-hidden>
          ✓
        </div>
        <h1>Session complete</h1>
        <p className="muted">Your proctoring session has ended and was submitted securely. You can close this window.</p>
      </div>
    </Shell>
  );
}

function LaunchEntry({
  client,
  token,
  onReady,
}: {
  client: ProctorShieldClient;
  token: string;
  onReady: (s: ActiveSession) => void;
}) {
  const [boot, setBoot] = useState<CandidateBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .exchangeLaunchToken(token)
      .then((r) => !cancelled && setBoot(r.data))
      .catch((e) => !cancelled && setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  if (error) {
    return (
      <Shell>
        <div className="card center">
          <h1>Unable to start proctoring</h1>
          <p className="error-text">{error}</p>
          <p className="muted">Return to your assessment and launch the proctored session again.</p>
        </div>
      </Shell>
    );
  }

  if (!boot) {
    return (
      <Shell>
        <div className="card center">
          <div className="spinner" aria-label="Loading" />
          <p className="muted">Preparing your secure session…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="card">
        <p className="eyebrow">Proctored assessment</p>
        <h1>{boot.exam?.title || 'Assessment'}</h1>
        <dl className="facts">
          <div>
            <dt>Candidate</dt>
            <dd>{boot.candidate_name || '—'}</dd>
          </div>
        </dl>
        <Checklist />
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I understand that my camera, microphone and screen will be recorded and reviewed by my organization for
            this assessment.
          </span>
        </label>
        <button
          type="button"
          className="btn primary block"
          disabled={!consent}
          onClick={() => onReady(toActive(boot))}
        >
          Continue to system check
        </button>
      </div>
    </Shell>
  );
}

function LinkEntry({
  client,
  token,
  onReady,
}: {
  client: ProctorShieldClient;
  token: string;
  onReady: (s: ActiveSession) => void;
}) {
  const [info, setInfo] = useState<Awaited<ReturnType<ProctorShieldClient['describeAccessLink']>>['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .describeAccessLink(token)
      .then((r) => !cancelled && setInfo(r.data))
      .catch((e) => !cancelled && setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  if (error) {
    return (
      <Shell>
        <div className="card center">
          <h1>This link cannot be used</h1>
          <p className="error-text">{error}</p>
          <p className="muted">Contact your organization for a new proctoring link.</p>
        </div>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <div className="card center">
          <div className="spinner" aria-label="Loading" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell organization={info.organization}>
      <DetailsForm
        organization={info.organization}
        fixedExamTitle={info.exam?.title}
        requireExamTitle={info.requires_exam_title}
        welcome={(info.branding?.candidate_welcome_message as string | undefined) || undefined}
        onSubmit={async (v) => {
          const r = await client.startFromAccessLink({
            link_token: token,
            candidate_name: v.candidate_name,
            exam_title: info.requires_exam_title ? v.exam_title : undefined,
            candidate_email: v.candidate_email || undefined,
          });
          onReady(toActive(r.data, v.candidate_name, v.exam_title || info.exam?.title || ''));
        }}
      />
    </Shell>
  );
}

function Checklist() {
  return (
    <ul className="checklist">
      <li>Use a laptop or desktop with a working webcam and microphone.</li>
      <li>Sit in a quiet, well-lit room, alone, with your face clearly visible.</li>
      <li>Close other applications and browser tabs. Keep your phone out of reach.</li>
      <li>You will be asked to share your screen and verify your identity.</li>
    </ul>
  );
}

function DetailsForm({
  organization,
  fixedExamTitle,
  requireExamTitle,
  welcome,
  note,
  onSubmit,
}: {
  organization?: string | null;
  fixedExamTitle?: string | null;
  requireExamTitle: boolean;
  welcome?: string;
  note?: string;
  onSubmit: (v: { candidate_name: string; exam_title?: string; candidate_email?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [exam, setExam] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = name.trim().length < 2 ? 'Enter your full name.' : null;
  const examError = requireExamTitle && !exam.trim() ? 'Enter the exam name.' : null;
  const emailError = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : null;
  const invalid = Boolean(nameError || examError || emailError || !consent);

  return (
    <form
      className="card"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (invalid) return;
        setBusy(true);
        setError(null);
        try {
          await onSubmit({
            candidate_name: name.trim(),
            exam_title: requireExamTitle ? exam.trim() : fixedExamTitle || undefined,
            candidate_email: email.trim() || undefined,
          });
        } catch (err) {
          setError(friendlyError(err));
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow">{organization || 'Proctored assessment'}</p>
      <h1>{fixedExamTitle || 'Start your proctored session'}</h1>
      {welcome && <p className="muted">{welcome}</p>}
      {note && <p className="note">{note}</p>}

      {requireExamTitle && (
        <Field label="Exam name" required error={touched ? examError : null}>
          <input
            value={exam}
            onChange={(e) => setExam(e.target.value)}
            placeholder="e.g. Data Structures — Midterm"
            maxLength={300}
            autoComplete="off"
          />
        </Field>
      )}
      <Field label="Full name" required error={touched ? nameError : null} hint="As it appears on your ID.">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First and last name"
          maxLength={200}
          autoComplete="name"
        />
      </Field>
      <Field label="Email" error={touched ? emailError : null} hint="Optional — helps your organization find your session.">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          maxLength={320}
          autoComplete="email"
        />
      </Field>

      <Checklist />
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I understand that my camera, microphone and screen will be recorded and reviewed by my organization for this
          assessment.
        </span>
      </label>
      {touched && !consent && <p className="field-error">Please confirm to continue.</p>}
      {error && <p className="error-text">{error}</p>}
      <button type="submit" className="btn primary block" disabled={busy}>
        {busy ? 'Starting…' : 'Continue to system check'}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
