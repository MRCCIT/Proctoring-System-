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
import { LockdownClient, createFetchTransport } from '../../lockdown/client';
import type { LockdownPolicy, SignedLockdownPolicy } from '../../lockdown/policy';
import { snapshotIntervalMs } from '../../capacity/levelPolicy';
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

/** A session created server-side (integration launch or access link) and exchanged for browser credentials. */
export interface ExamWindowSession {
  sessionId: string;
  sessionToken: string;
  wsToken: string;
}

export interface ExamWindowProps {
  /**
   * Tenant API key. Only for trusted/server-rendered contexts; browsers should use `session`
   * (from a launch token or access link) so no tenant-wide secret reaches the client.
   */
  apiKey?: string;
  baseUrl: string;
  /** Pre-created session; when set, the SDK never calls /sessions/init. */
  session?: ExamWindowSession;
  /** Shown to the candidate and stored on the session when the SDK creates it (API-key mode). */
  candidateName?: string;
  examTitle?: string;
  /** Show internal AI telemetry (development only). */
  debug?: boolean;
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
  /** Minimum gap between unified AI monitor ticks; default 150ms for fast phone catch */
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
  /** When true, also start legacy LockdownEnforcer (keyboard/screen hooks) alongside LockdownClient. */
  lockdownLegacyFallback?: boolean;
  /** Optional children rendered inside the exam area instead of the iframe */
  children?: React.ReactNode;
}

const wsBase = (baseUrl: string) => baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

export function ExamWindow(props: ExamWindowProps) {
  const {
    apiKey,
    baseUrl,
    session: presetSession,
    candidateName,
    examTitle,
    debug = false,
    examUrl,
    examId,
    candidateId,
    externalRef,
    branding: brandingProp,
    disableScreenRecording = false,
    faceCheckIntervalMs = 10_000,
    serverAi = true,
    analyzeMinIntervalMs = 150,
    phoneCheckMinIntervalMs = 60_000,
    identityReferenceImage,
    identityReferenceUrl,
    continuousIdentityCheck = true,
    identityCheckIntervalMs = 10_000,
    identityThreshold = 62,
    onSessionEnd,
    lockdownLegacyFallback = false,
    children,
  } = props;

  const presetToken = presetSession?.sessionToken;
  const client = useMemo(
    () => new ProctorShieldClient(presetToken ? { baseUrl, sessionToken: presetToken } : { baseUrl, apiKey }),
    [baseUrl, apiKey, presetToken]
  );
  const permsRef = useRef<PermissionManager | null>(null);
  if (!permsRef.current) permsRef.current = new PermissionManager();

  const [step, setStep] = useState<Step>('permissions');
  const [branding, setBranding] = useState<ExamWindowBranding>(brandingProp ?? {});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
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
  const policyRef = useRef<{
    ai_modules?: Record<string, boolean>;
    ai_sensitivity?: string;
    grace_period_seconds?: number;
    severity_thresholds?: Record<string, number>;
  } | null>(null);
  const identityServiceRef = useRef<IdentityCheckService | null>(null);
  const audioRef = useRef<AudioAnalyzer | null>(null);
  const lockRef = useRef<LockdownEnforcer | null>(null);
  const lockdownClientRef = useRef<LockdownClient | null>(null);
  const loadLevelRef = useRef<string>('L0');
  const snapshotMsRef = useRef(2000);
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
    let data: { session_id: string; ws_token: string };
    if (presetSession) {
      data = { session_id: presetSession.sessionId, ws_token: presetSession.wsToken };
    } else {
      const res = await client.initProctoringSession({
        exam_id: examId,
        exam_title: examId ? undefined : examTitle,
        candidate_id: candidateId,
        candidate_name: candidateName,
        external_candidate_ref: externalRef,
        sdk_version: '0.1.0',
        client_platform: navigator.userAgent,
      });
      data = res.data;
    }
    setSessionId(data.session_id);
    setWsToken(data.ws_token);
    try {
      const cfg = await client.getSessionConfig(data.session_id);
      const policy =
        (cfg.data as { policy?: typeof policyRef.current })?.policy ||
        (cfg.data as { effective_ai_config?: { session?: typeof policyRef.current } })?.effective_ai_config
          ?.session ||
        null;
      policyRef.current = policy;
      const cfgData = cfg.data as { load_level?: string; load_policy?: { thumbnailRefreshSec?: number } };
      if (cfgData?.load_level) {
        loadLevelRef.current = cfgData.load_level;
        const ms = snapshotIntervalMs(cfgData.load_level);
        if (ms > 0) snapshotMsRef.current = ms;
      }
    } catch {
      policyRef.current = null;
    }
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
  }, [
    client,
    presetSession,
    examId,
    examTitle,
    candidateId,
    candidateName,
    externalRef,
    identityReferenceImage,
    identityReferenceUrl,
  ]);

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
        if (t === 'load_level') {
          const lv = (msg as { level?: string }).level;
          if (lv) {
            loadLevelRef.current = lv;
            const ms = snapshotIntervalMs(lv);
            if (ms > 0) snapshotMsRef.current = ms;
          }
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

      const signedPolicy = await client
        .request<{ data: SignedLockdownPolicy | null }>('GET', `/v1/sdk/sessions/${sid}/lockdown-policy`)
        .then((r) => r.data)
        .catch(() => null);

      const lockPolicy: LockdownPolicy =
        signedPolicy?.policy ||
        ((await client.getSessionConfig(sid).catch(() => null))?.data as { lockdown_policy?: { policy: LockdownPolicy } })
          ?.lockdown_policy?.policy || {
          version: 1,
          mode: 'STANDARD',
          blockCopyPasteCut: true,
          blockContextMenu: true,
          blockPrint: false,
          blockDevToolsShortcuts: false,
          blockTextSelection: false,
          blockTabSwitch: true,
          singleSessionOnly: true,
          requireFullscreen: false,
          maxFullscreenExits: 3,
          graceSeconds: 5,
          maxTabSwitches: 5,
          multiMonitorPolicy: 'warn',
          requireWebcam: true,
          requireMic: false,
          requireScreenShare: false,
          browserIntegrity: 'none',
          rules: {},
          telemetry: { heartbeatSeconds: 15, batchMaxEvents: 20, batchMaxMs: 5000, offlineQueue: true },
        };

      const sessionAuthToken = presetToken || token || client.options.sessionToken || null;
      lockdownClientRef.current = new LockdownClient({
        sessionId: sid,
        policy: lockPolicy,
        transport: createFetchTransport({
          baseUrl,
          sessionId: sid,
          getToken: () => sessionAuthToken,
        }),
        onLocalAction: (action, ev) => {
          if (action === 'WARN' || action === 'PAUSE_EXAM' || action === 'AUTO_TERMINATE') {
            addViolation(String(ev.type), { severity: action === 'AUTO_TERMINATE' ? 'critical' : 'flag' });
          }
        },
      });
      lockdownClientRef.current.start();

      if (lockdownLegacyFallback) {
        lockRef.current = new LockdownEnforcer();
        lockRef.current.start((r: ViolationReason) => addViolation(r), {
          blockContextMenu: true,
          blockCopyPaste: true,
          blockScreenCapture: false,
        });
      }

      const modules = policyRef.current?.ai_modules || {};
      const moduleOn = (key: string, fallback = true) => (key in modules ? Boolean(modules[key]) : fallback);

      netRef.current = new NetworkMonitor();
      netRef.current.on((s) => {
        setOnline(s.online);
        if (moduleOn('network') && !s.online) addViolation('network_offline');
      });
      netRef.current.start(15_000, `${baseUrl}/health`);

      if (moduleOn('keystroke', false)) {
        ksRef.current = new KeystrokeAnalyzer();
        ksRef.current.start((a) => addViolation(`keystroke_${a.reason}`));
      }

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
        camMicStream.getVideoTracks().forEach((t) => lockdownClientRef.current?.observeTrack(t, 'camera'));
        camMicStream.getAudioTracks().forEach((t) => lockdownClientRef.current?.observeTrack(t, 'mic'));

        if (moduleOn('audio_voice') || moduleOn('audio_noise')) {
          audioRef.current = new AudioAnalyzer();
          audioRef.current.on((r) => {
            if (moduleOn('audio_voice') && r.voice_detected && r.level > 0.32) {
              addViolation('audio_voice_detected');
            }
          });
          audioRef.current.start(camMicStream, 4000);
        }

        const reference = identityReferenceImage || enrolledReference;
        const sens = policyRef.current?.ai_sensitivity || 'normal';
        const sensThreshold =
          sens === 'high' ? Math.min(identityThreshold + 8, 90) : sens === 'low' ? Math.max(identityThreshold - 8, 35) : identityThreshold;
        faceServiceRef.current = new FaceCheckService(client, sid, {
          intervalMs: faceCheckIntervalMs,
          getStream: () => camMicStreamRef.current,
          serverAi: serverAi && (moduleOn('face_detection') || moduleOn('gaze_tracking') || moduleOn('object_detection')),
          persistServerAi: true,
          analyzeMinIntervalMs,
          phoneCheckMinIntervalMs,
          referenceImage: reference || null,
          identityThreshold: sensThreshold,
          modules,
          onResult: (r) => {
            if (r.violations.includes('no_face_detected')) addViolation('no_face_detected');
            if (r.violations.includes('multiple_faces_detected')) addViolation('multiple_faces_detected');
          },
          onServerAnalysis: (r) => {
            (r.violations || []).forEach((v) => {
              if (v === 'identity_mismatch') {
                addViolation('identity_mismatch');
                return;
              }
              addViolation(`ai_${v}`);
            });
            if (
              moduleOn('gaze_tracking') &&
              r.gaze_direction &&
              r.gaze_direction !== 'center' &&
              (r.gaze_score ?? 0) > (sens === 'high' ? 0.45 : sens === 'low' ? 0.75 : 0.6)
            ) {
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

        if (continuousIdentityCheck && moduleOn('face_detection') && reference && hiddenVideoRef.current) {
          identityServiceRef.current = new IdentityCheckService(client, sid, reference, {
            intervalMs: identityCheckIntervalMs,
            getStream: () => camMicStreamRef.current,
            threshold: sensThreshold,
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
              setNotice(
                debug
                  ? 'AI service is not reachable (check AI_SERVICE_URL / python sidecar).'
                  : 'Automated monitoring is temporarily limited. Your session is still being recorded — please continue.'
              );
            }
          })
          .catch(() => {
            setNotice('Connection to the proctoring service is unstable. Keep this window open; we will keep trying.');
          });
      }

      setRecording(true);
    },
    [
      debug,
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
    const ms = Math.max(snapshotMsRef.current, 2000);
    if (loadLevelRef.current === 'L4') return;
    const id = window.setInterval(tick, ms);
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
    void lockdownClientRef.current?.flush();
    lockdownClientRef.current?.stop();
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
    lockdownClientRef.current = null;
    netRef.current = null;
    ksRef.current = null;
    chatRef.current = null;
  }, []);

  useEffect(
    () => () => {
      void tearDown();
    },
    [tearDown]
  );

  const endExam = async () => {
    if (!sessionId || ending) return;
    setEnding(true);
    try {
      await tearDown();
      await new Promise((r) => setTimeout(r, 400));
      await client.endSession(sessionId, { status: 'completed', success: true, reason: 'ended_by_candidate' });
    } catch (e) {
      setError((e as Error).message);
    }
    setEnding(false);
    setConfirmEnd(false);
    setRecording(false);
    setStep('submitted');
    onSessionEnd?.(sessionId);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: 24, color: '#0f172a' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {branding.logo_url && (
            <img src={branding.logo_url} alt={branding.organization_name || 'logo'} style={{ height: 36 }} />
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 20, color: primary }}>{examTitle || branding.organization_name || 'Proctored session'}</h1>
            {examTitle && branding.organization_name && (
              <div style={{ fontSize: 13, color: '#64748b' }}>{branding.organization_name}</div>
            )}
          </div>
        </div>
        {candidateName && (
          <div style={{ fontSize: 13, color: '#475569', textAlign: 'right' }}>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{candidateName}</div>
            <div>Candidate</div>
          </div>
        )}
      </header>
      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          {notice}
        </div>
      )}

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
              violations={violations.filter((v) => !['tab_visible', 'window_focus', 'single_display_detected'].includes(v)).length}
              online={online}
              brandPrimary={primary}
              paused={paused}
              aiStatus={serverAi && debug ? aiStatus : null}
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
                  <div style={{ color: '#475569', lineHeight: 1.6, maxWidth: 620 }}>
                    <h2 style={{ fontSize: 18, color: '#0f172a', marginTop: 0 }}>Proctoring is active</h2>
                    <p style={{ marginTop: 0 }}>
                      Your camera{screenStream ? ', microphone and screen are' : ' and microphone are'} being monitored for
                      this assessment. Complete your assessment as instructed by your organization.
                    </p>
                    <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
                      <li>Stay in view of the camera and keep your face visible.</li>
                      <li>Do not switch tabs, open other applications or use other devices.</li>
                      <li>Keep this window open until you have finished.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <small style={{ color: '#64748b' }}>
              {debug ? (
                <>
                  Face checks every {Math.round(faceCheckIntervalMs / 1000)}s · recording chunked every 10–15s
                  {serverAi && <> · AI tick {analyzeMinIntervalMs}ms</>}
                  {continuousIdentityCheck && (identityReferenceImage || enrolledReference) && (
                    <>
                      {' '}· identity vs. {enrolledCandidate?.name || 'reference'}
                      {identitySimilarity != null && ` · similarity ${identitySimilarity.toFixed(1)}`}
                    </>
                  )}
                </>
              ) : (
                'Your session is recorded and may be reviewed by your organization.'
              )}
            </small>
            {confirmEnd ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#0f172a' }}>End proctoring now?</span>
                <button
                  type="button"
                  onClick={() => setConfirmEnd(false)}
                  disabled={ending}
                  style={{
                    background: '#fff',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Keep going
                </button>
                <button
                  type="button"
                  onClick={() => void endExam()}
                  disabled={ending}
                  style={{
                    background: accent,
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    cursor: ending ? 'wait' : 'pointer',
                  }}
                >
                  {ending ? 'Finishing…' : 'Yes, I am finished'}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                style={{
                  background: accent,
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                I have finished
              </button>
            )}
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
        <section style={{ textAlign: 'center', padding: '48px 16px' }}>
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#dcfce7',
              color: '#15803d',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              marginBottom: 12,
            }}
          >
            ✓
          </div>
          <h2 style={{ margin: '0 0 8px' }}>Proctoring session complete</h2>
          <p style={{ color: '#475569', margin: 0 }}>
            Thank you. Your session has ended and has been securely submitted to{' '}
            {branding.organization_name || 'your organization'}. You can close this window.
          </p>
        </section>
      )}
    </div>
  );
}
