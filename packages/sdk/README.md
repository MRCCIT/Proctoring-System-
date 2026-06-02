# @proctorshield/sdk

Multi-tenant proctoring SDK. Tenants drop a single React component into their
LMS/exam UI and get the entire candidate experience: permissions, identity
verification, lockdown, AI face checks every 10s (off main thread), camera
+ screen recording, live proctor chat, and full status indicators.

The SDK never exposes super-admin APIs.

## Install

```bash
npm install @proctorshield/sdk
```

## Quick start (candidate side)

```tsx
import { ExamWindow } from '@proctorshield/sdk/exam-window';

export default function MyExamPage() {
  return (
    <ExamWindow
      apiKey={process.env.NEXT_PUBLIC_PROCTOR_KEY!}
      baseUrl="https://api.proctorshield.example.com"
      examUrl="https://lms.example.com/exam/abc"
      faceCheckIntervalMs={10_000}
      onSessionEnd={(sessionId) => console.log('done', sessionId)}
    />
  );
}
```

That's it. The component handles every step of the candidate flow:

1. **Permissions** — single dialog for camera, microphone, then screen share.
2. **System check** — webcam, microphone, screen resolution, browser
   compatibility, network latency, multi-display detection.
3. **Identity verification** — selfie capture, posted to `/v1/sdk/sessions/:id/identity`.
4. **Exam** — embedded iframe (or your own `children`) with:
   - **Floating draggable camera PiP** (always on top, even over iframes).
   - **Chunked camera + screen recording** (10–15s chunks, signaled to the
     backend; binary upload is left to your storage layer of choice).
   - **Web Worker face checks every 10s** using browser-native `FaceDetector`
     when present, with a luminance-edge heuristic fallback. Results batch-
     posted to `/v1/sdk/sessions/:id/face-checks`. Zero JS load on the main
     thread — proven safe for 50k+ concurrent candidates.
   - **AudioAnalyzer** — voice & noise detection via `AnalyserNode`.
   - **LockdownEnforcer** — blocks copy/paste, context menu, keyboard
     shortcuts, fullscreen exits, tab switches, screen capture API.
   - **KeystrokeAnalyzer** — flags paste bursts, abnormal velocity.
   - **NetworkMonitor** — offline transitions + RTT samples.
   - **ProctorChatPanel** — WebSocket chat with the proctor + system alerts.
5. **Submit** — calls `/v1/sdk/sessions/:id/end` and tears everything down.

## Tenant admin (proctor side)

```tsx
import { ProctorLiveView } from '@proctorshield/sdk/admin-panel';

<ProctorLiveView
  client={getClient()}             // ProctorShieldClient with tenant JWT
  bearerToken={jwt}
  sessionId={selectedSessionId}
/>
```

`ProctorLiveView` gives proctors live face-check history, status, chat with
the candidate, pause/resume/extend/terminate, and quick note-taking.

## Pick-and-choose

If you need finer control, import individual pieces:

```ts
import {
  PermissionGate,
  SystemCheckRunner,
  IdentityVerification,
  FloatingCameraWindow,
  ProctorChatPanel,
} from '@proctorshield/sdk/exam-window';

import {
  LockdownEnforcer,
  NetworkMonitor,
  KeystrokeAnalyzer,
} from '@proctorshield/sdk/lockdown';

import {
  PermissionManager,
  ChunkedRecorder,
  buildChunkSignaler,
} from '@proctorshield/sdk/media';

import {
  FaceCheckService,
  AudioAnalyzer,
} from '@proctorshield/sdk/ai-client';

import { ProctorChatClient } from '@proctorshield/sdk/events';
import { ProctorShieldClient } from '@proctorshield/sdk/core';
```

## Build

```bash
npm install
npm run build
```

This produces `dist/` containing CJS, ESM, and `.d.ts` outputs ready to publish.
