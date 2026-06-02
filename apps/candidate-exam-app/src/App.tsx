import { useState } from 'react';
import { ExamWindow } from '@proctorshield/sdk/exam-window';

const baseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001';
const apiKey = import.meta.env.VITE_API_KEY || '';

export default function App() {
  const [examId, setExamId] = useState('');
  const [externalRef, setExternalRef] = useState('savej');
  const [started, setStarted] = useState(false);
  const [examUrl, setExamUrl] = useState('');
  const [skipScreen, setSkipScreen] = useState(false);
  const [serverAi, setServerAi] = useState(true);
  const [continuousIdentity, setContinuousIdentity] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  if (!apiKey) {
    return (
      <main style={{ padding: 32, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui' }}>
        <h1>Candidate exam app</h1>
        <p>
          This Vite app demonstrates how a tenant integrates the ProctorShield SDK. Set{' '}
          <code>VITE_API_KEY</code> in <code>apps/candidate-exam-app/.env</code> with the tenant
          key created during seeding to launch a real session.
        </p>
        <pre
          style={{
            background: '#0f172a',
            color: '#f8fafc',
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
            overflow: 'auto',
          }}
        >{`import { ExamWindow } from '@proctorshield/sdk/exam-window';

<ExamWindow
  apiKey={apiKey}
  baseUrl={baseUrl}
  examUrl="https://lms.example.com/exam/abc"
/>`}
        </pre>
      </main>
    );
  }

  if (done) {
    return (
      <main style={{ padding: 32, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui' }}>
        <h1>Exam complete</h1>
        <p>
          Session <code>{done}</code> ended and proctoring artifacts were uploaded.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setStarted(false);
          }}
        >
          Run another session
        </button>
      </main>
    );
  }

  if (!started) {
    return (
      <main style={{ padding: 32, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui' }}>
        <h1>Start exam</h1>
        <p>Configure session, then click <strong>Begin</strong>.</p>
        <p>
          <label>Exam ID (optional UUID)</label>
          <br />
          <input value={examId} onChange={(e) => setExamId(e.target.value)} style={{ width: '100%' }} />
        </p>
        <p>
          <label>External candidate ref</label>
          <br />
          <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} style={{ width: '100%' }} />
          <small style={{ color: '#64748b' }}>
            Use <code>savej</code> to use the seeded local user whose enrolled photo is matched against
            the live camera every {10}s.
          </small>
        </p>
        <p>
          <label>Exam content URL (iframe; optional)</label>
          <br />
          <input value={examUrl} onChange={(e) => setExamUrl(e.target.value)} style={{ width: '100%' }} />
        </p>
        <p>
          <label>
            <input
              type="checkbox"
              checked={skipScreen}
              onChange={(e) => setSkipScreen(e.target.checked)}
            />{' '}
            Skip screen recording (coding exam)
          </label>
        </p>
        <p>
          <label>
            <input
              type="checkbox"
              checked={serverAi}
              onChange={(e) => setServerAi(e.target.checked)}
            />{' '}
            Use Python AI sidecar (gaze, multi-face, phone)
          </label>
          <br />
          <small style={{ color: '#64748b' }}>
            Unified Python AI (face, gaze, phone, identity) runs about every 2s during the exam. Watch the
            green &quot;AI&quot; pill on the exam bar and refresh the tenant session timeline.
          </small>
        </p>
        <p>
          <label>
            <input
              type="checkbox"
              checked={continuousIdentity}
              onChange={(e) => setContinuousIdentity(e.target.checked)}
            />{' '}
            Continuous identity match (ArcFace, every 10s)
          </label>
          <br />
          <small style={{ color: '#64748b' }}>
            The SDK fetches the enrolled reference photo for this candidate from the API and matches
            every frame against it. Mismatch raises a violation and a snapshot is saved.
          </small>
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          style={{
            background: '#0f172a',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Begin
        </button>
      </main>
    );
  }

  return (
    <ExamWindow
      apiKey={apiKey}
      baseUrl={baseUrl}
      examId={examId || undefined}
      examUrl={examUrl || undefined}
      externalRef={externalRef || undefined}
      disableScreenRecording={skipScreen}
      faceCheckIntervalMs={15_000}
      serverAi={serverAi}
      analyzeMinIntervalMs={500}
      continuousIdentityCheck={continuousIdentity && !serverAi}
      identityCheckIntervalMs={10_000}
      identityThreshold={62}
      onSessionEnd={(sid) => setDone(sid)}
    />
  );
}
