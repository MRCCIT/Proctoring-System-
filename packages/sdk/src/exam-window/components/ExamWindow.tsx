'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProctorShieldClient } from '../../core/ProctorShieldClient';
import { PermissionManager } from '../../media/PermissionManager';
import { ChunkedRecorder, buildChunkSignaler } from '../../media/ChunkedRecorder';
import { bindStreamToVideo, captureFrameFromStream } from '../../media/captureFrame';
import { LiveVideoSignaling } from '../../media/LiveVideoSignaling';
import { FaceCheckService } from '../../ai-client/FaceCheckService';
import { IdentityCheckService } from '../../ai-client/IdentityCheckService';
import { AudioAnalyzer } from '../../ai-client/AudioAnalyzer';
import { LockdownEnforcer, ViolationReason } from '../../lockdown/LockdownEnforcer';
import { NetworkMonitor } from '../../lockdown/NetworkMonitor';
import { KeystrokeAnalyzer } from '../../lockdown/KeystrokeAnalyzer';
import { ProctorChatClient } from '../../events/ProctorChatClient';
import { PermissionGate } from './PermissionGate';
import { SystemCheckRunner } from './SystemCheckRunner';
import { IdentityVerification } from './IdentityVerification';
import { FloatingCameraWindow } from './FloatingCameraWindow';
import { ProctoringIndicator } from './ProctoringIndicator';
import { ProctorChatPanel } from './ProctorChatPanel';
import { ViolationAlert } from './ViolationAlert';

type Step = 'permissions' | 'system-check' | 'identity' | 'exam' | 'submitted';

export interface ExamWindowBranding {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  organization_name?: string;
  logo_url?: string;
  candidate_welcome_message?: string;
}

export interface ExamWindowProps {
  apiKey: string;
  baseUrl: string;
  /** URL of the exam content to embed in an iframe. Optional — pass children instead. */
  examUrl?: string;
  /** Optional UUID of an exam already created in the tenant admin */
  examId?: string;
  /** Optional UUID of the candidate row */
  candidateId?: string;
  /** External reference; surfaced in event payloads & reports */
  externalRef?: string;
  /** Override branding if you fetch it elsewhere. Otherwise it's loaded from /v1/sdk/branding */
  branding?: ExamWindowBranding;
  /** Skip screen capture permission (e.g. coding exams) */
  disableScreenRecording?: boolean;
  /** ms between face checks; default 10000 */
  faceCheckIntervalMs?: number;
  /**
   * Enable the Python AI sidecar tier (analyze-frame + phone-check).
   * Default true — disable only when no AI server is deployed.
   */
  serverAi?: boolean;
  /** Minimum gap between analyze-frame calls per session; default 30s */
  analyzeMinIntervalMs?: number;
  /** Minimum gap between phone-check calls per session; default 60s */
  phoneCheckMinIntervalMs?: number;
  /** Optional reference photo (data URL/base64) for ArcFace identity match */
  identityReferenceImage?: string;
  /** Optional reference photo URL for ArcFace identity match */
  identityReferenceUrl?: string;
  /** Continuously face-match the candidate against the enrolled reference every interval; default true */
  continuousIdentityCheck?: boolean;
  /** ms between continuous identity checks; default 10_000 */
  identityCheckIntervalMs?: number;
  /** Minimum ArcFace similarity during exam (0–100); default 55 */
  identityThreshold?: number;
  /** Called when session ends */
  onSessionEnd?: (sessionId: string) => void;
  /** Optional children rendered inside the exam area instead of the iframe */
  children?: React.ReactNode;
}

const wsBase = (baseUrl: string) => baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

export function ExamWindow(props: ExamWindowProps) {
  const {
    apiKey,
    baseUrl,
    examUrl,
    examId,
    candidateId,
    externalRef,
    branding: brandingProp,
    disableScreenRecording = false,
    faceCheckIntervalMs = 10_000,
    serverAi = true,
    analyzeMinIntervalMs = 500,
    phoneCheckMinIntervalMs = 60_000,
    identityReferenceImage,
    identityReferenceUrl,
    continuousIdentityCheck = true,
    identityCheckIntervalMs = 10_000,
    identityThreshold = 62,
    onSessionEnd,
    children,
  } = props;

  const client = useMemo(() => new ProctorShieldClient({ baseUrl, apiKey }), [baseUrl, apiKey]);
  const permsRef = useRef<PermissionManager | null>(null);
  if (!permsRef.current) permsRef.current = new PermissionManager();

  const [step, setStep] = useState<Step>('permissions');
  const [branding, setBranding] = useState<ExamWindowBranding>(brandingProp ?? {});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [online, setOnline] = useState(true);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [camCollapsed, setCamCollapsed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [camMicStream, setCamMicStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [enrolledReference, setEnrolledReference] = useState<string | null>(null);
  const [enrolledCandidate, setEnrolledCandidate] = useState<{ id?: string; name?: string; external_ref?: string } | null>(null);
  const [identitySimilarity, setIdentitySimilarity] = useState<number | null>(null);
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; label: string } | null>(null);

  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const camMicStreamRef = useRef<MediaStream | null>(null);
  const camRecorderRef = useRef<ChunkedRecorder | null>(null);
  const screenRecorderRef = useRef<ChunkedRecorder | null>(null);
  const faceServiceRef = useRef<FaceCheckService | null>(null);
  const identityServiceRef = useRef<IdentityCheckService | null>(null);
  const audioRef = useRef<AudioAnalyzer | null>(null);
  const lockRef = useRef<LockdownEnforcer | null>(null);
  const netRef = useRef<NetworkMonitor | null>(null);
  const ksRef = useRef<KeystrokeAnalyzer | null>(null);
  const chatRef = useRef<ProctorChatClient | null>(null);
  const liveVideoRef = useRef<LiveVideoSignaling | null>(null);
  /** Avoid flooding session_events + snapshots with repeated violations */
  const lastViolationEmitRef = useRef<Map<string, number>>(new Map());

  const accent = branding.accent_color || '#dc2626';
  const primary = branding.primary_color || '#0f172a';

  useEffect(() => {
    camMicStreamRef.current = camMicStream;
    const v = hiddenVideoRef.current;
    if (camMicStream && v) void bindStreamToVideo(camMicStream, v);
  }, [camMicStream, step]);

  const captureSnapshotDataUrl = useCallback(async (): Promise<string | null> => {
    return captureFrameFromStream(camMicStreamRef.current, hiddenVideoRef.current);
  }, []);

  const pushViolationUi = useCallback((reason: string) => {
    setViolations((prev) => (prev.includes(reason) ? prev : [...prev, reason]));
  }, []);

  const addViolation = useCallback(
    (reason: string, opts?: { severity?: string }) => {
      setViolations((prev) => (prev.includes(reason) ? prev : [...prev, reason]));
      if (!sessionId) return;

      const now = Date.now();
      const cooldownMs =
        reason === 'audio_voice_detected'
          ? 25_000
          : reason.startsWith('keystroke_')
            ? 14_000
            : reason.startsWith('network_')
              ? 35_000
              : reason.startsWith('ai_') ||
                  reason.startsWith('gaze_') ||
                  reason === 'phone_detected' ||
                  reason === 'identity_mismatch'
                ? 4_000
                : 12_000;

      const last = lastViolationEmitRef.current.get(reason) ?? 0;
      if (now - last < cooldownMs) return;
      lastViolationEmitRef.current.set(reason, now);

      void client
        .postSdkEvents({
          session_id: sessionId,
          events: [
            {
              type: `violation.${reason}`,
              severity: opts?.severity ?? 'warn',
              occurred_at: new Date().toISOString(),
            },
          ],
        })
        .catch(() => {});

      void captureSnapshotDataUrl().then((img) => {
        if (!img) return;
        void client
          .postSnapshot(sessionId, {
            image_base64: img,
            caption: `Violation: ${reason}`,
            label: reason,
            source: 'violation',
            mime_type: 'image/jpeg',
            violation_context: { violation: reason, occurred_at: new Date().toISOString() },
          })
          .catch(() => {});
      });
    },
    [client, sessionId, captureSnapshotDataUrl]
  );

  useEffect(() => {
    if (brandingProp) return;
    void client
      .getSdkBranding()
      .then((r) => setBranding((b) => ({ ...b, ...(r.data as ExamWindowBranding) })))
      .catch(() => {});
  }, [client, brandingProp]);

  const initSession = useCallback(async () => {
    const { data } = await client.initProctoringSession({
      exam_id: examId,
      candidate_id: candidateId,
      external_candidate_ref: externalRef,
      sdk_version: '0.1.0',
      client_platform: navigator.userAgent,
    });
    setSessionId(data.session_id);
    setWsToken(data.ws_token);
    if (!identityReferenceImage && !identityReferenceUrl) {
      try {
        const ref = await client.getIdentityReference(data.session_id);
        if (ref.data?.enrolled && ref.data?.data_url) {
          setEnrolledReference(ref.data.data_url);
          setEnrolledCandidate(ref.data.candidate || null);
        }
      } catch {
        /* enrolled reference is optional */
      }
    }
    return data;
  }, [client, examId, candidateId, externalRef, identityReferenceImage, identityReferenceUrl]);

  const startExam = useCallback(
    async (sid: string, token: string) => {
      const wsUrl = `${wsBase(baseUrl)}/v1/sdk/ws/sessions/${sid}`;
      chatRef.current = new ProctorChatClient({ wsUrl, token });
      chatRef.current.connect();
      chatRef.current.on((msg) => {
        const t = (msg as { type?: string }).type;
        if (t === 'session_paused') setPaused(true);
        if (t === 'session_resumed') setPaused(false);
        if (t === 'session_terminated') {
          setPaused(false);
          setRecording(false);
          setStep('submitted');
          onSessionEnd?.(sid);
        }
      });

      liveVideoRef.current?.stop();
      void LiveVideoSignaling.create(client, {
        role: 'candidate',
        chat: chatRef.current,
        getLocalStream: () => camMicStreamRef.current,
      }).then((sig) => {
        liveVideoRef.current = sig;
        sig.start();
      });

      lockRef.current = new LockdownEnforcer();
      lockRef.current.start((r: ViolationReason) => addViolation(r), {
        blockContextMenu: true,
        blockCopyPaste: true,
        blockScreenCapture: false,
      });

      netRef.current = new NetworkMonitor();
      netRef.current.on((s) => {
        setOnline(s.online);
        if (!s.online) addViolation('network_offline');
      });
      netRef.current.start(15_000, `${baseUrl}/health`);

      ksRef.current = new KeystrokeAnalyzer();
      ksRef.current.start((a) => addViolation(`keystroke_${a.reason}`));

      if (camMicStream) {
        camMicStreamRef.current = camMicStream;
        if (hiddenVideoRef.current) {
          await bindStreamToVideo(camMicStream, hiddenVideoRef.current);
        }

        camRecorderRef.current = new ChunkedRecorder({
          track: 'camera',
          chunkMs: 10_000,
          onChunk: buildChunkSignaler(client, sid),
        });
        camRecorderRef.current.start(camMicStream);

        audioRef.current = new AudioAnalyzer();
        audioRef.current.on((r) => {
          if (r.voice_detected && r.level > 0.32) addViolation('audio_voice_detected');
        });
        audioRef.current.start(camMicStream, 4000);

        const reference = identityReferenceImage || enrolledReference;
        faceServiceRef.current = new FaceCheckService(client, sid, {
          intervalMs: faceCheckIntervalMs,
          getStream: () => camMicStreamRef.current,
          serverAi,
          persistServerAi: true,
          analyzeMinIntervalMs,
          phoneCheckMinIntervalMs,
          referenceImage: reference || null,
          identityThreshold,
          onResult: (r) => {
            if (r.violations.includes('no_face_detected')) addViolation('no_face_detected');
            if (r.violations.includes('multiple_faces_detected')) addViolation('multiple_faces_detected');
          },
          onServerAnalysis: (r) => {
            (r.violations || []).forEach((v) => addViolation(`ai_${v}`));
            if (r.gaze_direction && r.gaze_direction !== 'center' && (r.gaze_score ?? 0) > 0.6) {
              addViolation(`gaze_${r.gaze_direction}`);
            }
            if (r.identity_match === false) addViolation('identity_mismatch');
            if (r.identity_score != null) setIdentitySimilarity(r.identity_score);
          },
          onServerPhoneCheck: () => {
            /* phone_visible is raised via onServerAnalysis violations */
          },
          onServerTick: (r) => {
            const gaze =
              r.gaze_direction && r.gaze_direction !== 'center' ? ` gaze:${r.gaze_direction}` : '';
            const viols = (r.violations || []).length ? ` · ${(r.violations || []).join(',')}` : '';
            const ms =
              r.processing_time_ms != null ? ` · ${Math.round(r.processing_time_ms)}ms` : '';
            setAiStatus({
              ok: true,
              label: `faces=${r.face_count ?? '?'}${gaze}${viols}${ms}`.slice(0, 96),
            });
          },
          onServerError: (msg) => {
            setAiStatus({ ok: false, label: msg.slice(0, 80) });
          },
        });
        if (hiddenVideoRef.current) faceServiceRef.current.start(hiddenVideoRef.current);

        if (continuousIdentityCheck && !serverAi && reference && hiddenVideoRef.current) {
          identityServiceRef.current = new IdentityCheckService(client, sid, reference, {
            intervalMs: identityCheckIntervalMs,
            getStream: () => camMicStreamRef.current,
            threshold: identityThreshold,
            onResult: (r) => setIdentitySimilarity(r.similarity),
            onMismatch: () => addViolation('identity_mismatch'),
            onRestored: () => {
              /* clearing the violation tag is optional; we keep history */
            },
          });
          identityServiceRef.current.start(hiddenVideoRef.current);
        }
      }

      if (screenStream) {
        screenRecorderRef.current = new ChunkedRecorder({
          track: 'screen',
          chunkMs: 15_000,
          onChunk: buildChunkSignaler(client, sid),
        });
        screenRecorderRef.current.start(screenStream);
      }

      await client.startStream(sid, {
        transport: 'chunked_post',
        camera: Boolean(camMicStream),
        screen: Boolean(screenStream),
      });

      if (serverAi) {
        void fetch(`${baseUrl.replace(/\/$/, '')}/health`)
          .then((r) => r.json())
          .then((h: { ai?: string }) => {
            if (h.ai !== 'up') {
              setError(
                'Python AI sidecar is not reachable. Run `npm run dev:ai` in the repo root (port 5055), then refresh.'
              );
            }
          })
          .catch(() => {
            setError('Cannot reach the API for AI health check. Confirm `npm run dev:api` is running.');
          });
      }

      setRecording(true);
    },
    [
      baseUrl,
      camMicStream,
      client,
      screenStream,
      addViolation,
      pushViolationUi,
      faceCheckIntervalMs,
      onSessionEnd,
      serverAi,
      analyzeMinIntervalMs,
      phoneCheckMinIntervalMs,
      identityReferenceImage,
      enrolledReference,
      continuousIdentityCheck,
      identityCheckIntervalMs,
      identityThreshold,
    ]
  );

  useEffect(() => {
    const ref = identityReferenceImage || enrolledReference;
    faceServiceRef.current?.setReferenceImage(ref || null);
  }, [identityReferenceImage, enrolledReference]);

  useEffect(() => {
    if (step !== 'exam') return;
    const t = setInterval(() => setSeconds((s) => (paused ? s : s + 1)), 1000);
    return () => clearInterval(t);
  }, [step, paused]);

  /** Periodic JPEG so tenant admins see the candidate without waiting for violations */
  useEffect(() => {
    if (step !== 'exam' || !sessionId || paused) return;
    const tick = () => {
      void captureSnapshotDataUrl().then((img) => {
        if (!img) return;
        void client.postSnapshot(sessionId, {
          image_base64: img,
          caption: 'Live monitor frame',
          source: 'live_preview',
          label: 'live',
          mime_type: 'image/jpeg',
          violation_context: { live_preview: true, ts: new Date().toISOString() },
        });
      });
    };
    const id = window.setInterval(tick, 2_000);
    tick();
    return () => clearInterval(id);
  }, [step, sessionId, paused, client, captureSnapshotDataUrl]);

  const tearDown = useCallback(async () => {
    await Promise.all([
      camRecorderRef.current?.stop() ?? Promise.resolve(),
      screenRecorderRef.current?.stop() ?? Promise.resolve(),
    ]);
    faceServiceRef.current?.stop();
    identityServiceRef.current?.stop();
    audioRef.current?.stop();
    lockRef.current?.stop();
    netRef.current?.stop();
    ksRef.current?.stop();
    liveVideoRef.current?.stop();
    liveVideoRef.current = null;
    chatRef.current?.close();
    permsRef.current?.release();
    camRecorderRef.current = null;
    screenRecorderRef.current = null;
    faceServiceRef.current = null;
    identityServiceRef.current = null;
    audioRef.current = null;
    lockRef.current = null;
    netRef.current = null;
    ksRef.current = null;
    chatRef.current = null;
  }, []);

  useEffect(() => () => tearDown(), [tearDown]);

  const endExam = async () => {
    if (!sessionId) return;
    try {
      await tearDown();
      await new Promise((r) => setTimeout(r, 400));
      await client.endSession(sessionId, { status: 'completed', success: true });
    } catch (e) {
      setError((e as Error).message);
    }
    setRecording(false);
    setStep('submitted');
    onSessionEnd?.(sessionId);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: 24, color: '#0f172a' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {branding.logo_url && <img src={branding.logo_url} alt={branding.organization_name || 'logo'} style={{ height: 36 }} />}
        <h1 style={{ margin: 0, fontSize: 22, color: primary }}>
          {branding.organization_name || 'ProctorShield Exam'}
        </h1>
      </header>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

      {camMicStream && (
        <video ref={hiddenVideoRef} autoPlay muted playsInline style={{ display: 'none' }} aria-hidden />
      )}

      {step === 'permissions' && (
        <>
          {branding.candidate_welcome_message && (
            <p style={{ color: '#475569', marginBottom: 12 }}>{branding.candidate_welcome_message}</p>
          )}
          <PermissionGate
            manager={permsRef.current!}
            requireScreen={!disableScreenRecording}
            brandPrimary={primary}
            onAllReady={async ({ camMicStream: cm, screenStream: ss }) => {
              setCamMicStream(cm);
              setScreenStream(ss);
              setStep('system-check');
            }}
          />
        </>
      )}

      {step === 'system-check' && (
        <SystemCheckRunner
          camMicStream={camMicStream}
          probeUrl={`${baseUrl}/health`}
          brandPrimary={primary}
          onStreamAcquired={setCamMicStream}
          onComplete={async (results) => {
            try {
              const data = await initSession();
              await client.submitSystemCheck(data.session_id, {
                results,
                client_info: { userAgent: navigator.userAgent, screen: results.screen },
              });
              setStep('identity');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}

      {step === 'identity' && sessionId && (
        <IdentityVerification
          client={client}
          sessionId={sessionId}
          cameraStream={camMicStream}
          brandPrimary={primary}
          referenceImage={identityReferenceImage || enrolledReference || undefined}
          referenceUrl={identityReferenceUrl}
          minSimilarity={identityThreshold}
          onDone={async () => {
            if (!sessionId || !wsToken) return;
            setStep('exam');
            try {
              await startExam(sessionId, wsToken);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}

      {step === 'exam' && sessionId && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <ProctoringIndicator
              recording={recording}
              sessionId={sessionId}
              violations={violations.length}
              online={online}
              brandPrimary={primary}
              paused={paused}
              aiStatus={serverAi ? aiStatus : null}
            />
            <span style={{ fontSize: 14, color: '#475569' }}>
              Elapsed&nbsp;{mins}:{String(secs).padStart(2, '0')}
            </span>
          </div>
          {violations.length > 0 && <ViolationAlert violations={violations} />}
          <div style={{ minHeight: 460, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
            {examUrl ? (
              <iframe
                title="Exam"
                src={examUrl}
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            ) : (
              <div style={{ padding: 24 }}>
                {children ?? (
                  <p style={{ color: '#475569' }}>
                    Pass <code>examUrl</code> to embed your LMS, or use the SDK as a wrapper around your own exam UI by
                    providing <code>children</code>.
                  </p>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <small style={{ color: '#64748b' }}>
              Face checks every {Math.round(faceCheckIntervalMs / 1000)}s · Camera + screen recording chunked every 10–15s
              {serverAi && (
                <>
                  {' '}
                  · Unified AI every {analyzeMinIntervalMs < 1000 ? `${analyzeMinIntervalMs}ms` : `${Math.round(analyzeMinIntervalMs / 1000)}s`}
                </>
              )}
              {continuousIdentityCheck && !serverAi && (identityReferenceImage || enrolledReference) && (
                <>
                  {' '}· Identity match every {Math.round(identityCheckIntervalMs / 1000)}s
                  {enrolledCandidate?.name ? ` vs. ${enrolledCandidate.name}` : ''}
                  {identitySimilarity != null && ` · similarity ${identitySimilarity.toFixed(2)}`}
                </>
              )}
            </small>
            <button
              type="button"
              onClick={() => void endExam()}
              style={{
                background: accent,
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Submit &amp; end session
            </button>
          </div>
          <FloatingCameraWindow
            stream={camMicStream}
            collapsed={camCollapsed}
            onCollapseChange={setCamCollapsed}
            statusLabel={paused ? 'Paused' : 'Proctoring'}
            recording={recording && !paused}
            accentColor={accent}
          />
          <ProctorChatPanel
            client={client}
            sessionId={sessionId}
            chatWs={chatRef.current}
            brandPrimary={primary}
            collapsed={chatCollapsed}
            onCollapseChange={setChatCollapsed}
          />
        </section>
      )}

      {step === 'submitted' && (
        <section>
          <h2>Exam submitted</h2>
          <p>Session ended. Recording and AI evidence have been uploaded to {branding.organization_name || 'your organization'}.</p>
        </section>
      )}
    </div>
  );
}
