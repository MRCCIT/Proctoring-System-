/**
 * Ankit.inc — client integration reference.
 *
 * What a client plugs:
 *   baseUrl + apiKey (or session) + candidate/exam + identity reference
 * Optional: examUrl or children (sample paper below)
 */
import { createRoot } from 'react-dom/client';
import { ExamWindow } from '@proctorshield/sdk/exam-window';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Ankit.inc tenant API key — production me yeh browser me mat rakho; launch/session use karo. */
const ANKIT_API_KEY = 'psk_live_CJ09Jl_AtB-1I4MRS4gN_umQ3vbYI4ef8rSOTJ945TE';

/** Sample exam content (client apna LMS UI yahan children / examUrl se dega). */
function SampleExamPaper() {
  return (
    <div style={{ color: '#0f172a', lineHeight: 1.55, maxWidth: 640, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Sample paper · Ankit.inc reference</h2>
      <p style={{ color: '#64748b', marginTop: 0 }}>
        Ye host/LMS content hai. Upar permissions → system check → identity SDK handle karti hai.
        Corner me floating camera SDK se aati hai.
      </p>
      <ol style={{ paddingLeft: 18 }}>
        <li style={{ marginBottom: 12 }}>
          <strong>Q1.</strong> Proctoring ke liye minimum kya chahiye?
          <div style={{ marginTop: 6, color: '#475569' }}>A) baseUrl + auth &nbsp; B) sirf examUrl &nbsp; C) sirf logo</div>
        </li>
        <li style={{ marginBottom: 12 }}>
          <strong>Q2.</strong> Face match ke liye kya pass karte ho?
          <div style={{ marginTop: 6, color: '#475569' }}>A) identityReferenceUrl &nbsp; B) examUrl &nbsp; C) debug</div>
        </li>
      </ol>
      <p style={{ fontSize: 13, color: '#64748b' }}>
        Jab ready ho, neeche SDK ka <em>I have finished</em> dabao — session end + evidence portal pe.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ExamWindow
    baseUrl={API_BASE}
    apiKey={ANKIT_API_KEY}
    candidateName="Savej"
    examTitle="Ankit.inc · SDK client reference"
    identityReferenceUrl={`${window.location.origin}/savej-reference.png`}
    serverAi
    analyzeMinIntervalMs={500}
    continuousIdentityCheck
    identityCheckIntervalMs={10_000}
    onSessionEnd={(sessionId) => {
      console.log('[ankit-inc-reference] session ended', sessionId);
      alert(`Session ended: ${sessionId}\nTenant portal → Ankit.inc → Sessions me check karo.`);
    }}
  >
    <SampleExamPaper />
  </ExamWindow>
);
