/**
 * Ankit.inc API-key plug — full ExamWindow (permissions → system check → identity → exam).
 * Floating camera + live WebRTC come from the SDK; host page is only the mount.
 */
import { createRoot } from 'react-dom/client';
import { ExamWindow } from '@proctorshield/sdk/exam-window';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const ANKIT_API_KEY = 'psk_live_CJ09Jl_AtB-1I4MRS4gN_umQ3vbYI4ef8rSOTJ945TE';

createRoot(document.getElementById('root')!).render(
  <ExamWindow
    baseUrl={API_BASE}
    apiKey={ANKIT_API_KEY}
    candidateName="Savej"
    examTitle="Ankit SDK Plug · Full flow"
    identityReferenceUrl={`${window.location.origin}/savej-reference.png`}
    serverAi
    analyzeMinIntervalMs={500}
    continuousIdentityCheck
    identityCheckIntervalMs={10_000}
    onSessionEnd={(sessionId) => {
      console.log('[ankit-sdk-plug] session ended', sessionId);
    }}
  />
);
