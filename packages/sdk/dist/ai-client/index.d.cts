import { P as ProctorShieldClient } from '../ProctorShieldClient-B8list-d.cjs';

/** WASM placeholder — wire ONNX/MediaPipe WASM when available */
declare class LocalInference {
    analyzeFrame(_imageDataUrl: string): Promise<{
        violations: string[];
    }>;
}

declare class CloudInference {
    private readonly client;
    constructor(client: ProctorShieldClient);
    analyzeFrame(sessionId: string, imageDataUrl: string, persist?: boolean): Promise<{
        data: {
            analysis: Record<string, unknown>;
            persistence?: unknown;
            state?: unknown;
        };
    }>;
}

/**
 * Thin wrapper around the (browser-native, Chrome) FaceDetector. Returns a
 * normalized result so callers can swap to an alternative model without
 * coupling. For server-side ArcFace verification, use the cloud client.
 */
declare class FaceDetector {
    private detector;
    private kind;
    init(): void;
    detect(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<{
        faceCount: number;
        detector: string;
    }>;
    detectFromDataUrl(imageDataUrl: string): Promise<{
        faceCount: number;
    }>;
}

declare class GazeEstimator {
    estimate(_landmarks?: unknown): {
        direction: string;
        away: boolean;
    };
}

declare class ObjectDetector {
    detectPhone(_imageDataUrl: string): Promise<boolean>;
}

interface AudioReading {
    /** RMS volume 0..1 */
    level: number;
    /** Rough estimate of whether voice band (300-3000Hz) carries energy */
    voice_detected: boolean;
    /** Loudness score 0..1 */
    noise: number;
    ts: number;
}
/**
 * Cheap audio monitor. Uses WebAudio AnalyserNode (built-in, off main JS thread on most engines)
 * to estimate volume and voice-band activity. Reports a reading at the given interval.
 */
declare class AudioAnalyzer {
    private ctx;
    private source;
    private analyser;
    private timer;
    private listeners;
    start(stream: MediaStream, intervalMs?: number): void;
    on(fn: (r: AudioReading) => void): () => boolean;
    private tick;
    /** Legacy alias used by ExamFrame placeholder */
    analyze(_buffer: ArrayBuffer): Promise<{
        voice_detected: boolean;
        noise: number;
    }>;
    stop(): void;
}

interface FaceCheckResult {
    face_count: number;
    detector: string;
    ts: number;
    violations: string[];
}
interface ServerAiAnalysis {
    face_count?: number;
    sideways_score?: number;
    violations?: string[];
    gaze_direction?: string | null;
    gaze_score?: number | null;
    gaze_detector?: string | null;
    phone_detected?: boolean;
    phone_streak?: number;
    phone_active?: boolean;
    electronics_detected?: boolean;
    electronics_labels?: string[];
    electronics_streak?: number;
    electronics_active?: boolean;
    identity_match?: boolean | null;
    identity_score?: number | null;
    brightness?: number;
    processing_time_ms?: number;
}
interface ServerAiPhoneResult {
    phone_detected: boolean;
    yolo_enabled: boolean;
}
interface FaceCheckServiceOptions {
    intervalMs?: number;
    flushAt?: number;
    flushIntervalMs?: number;
    onResult?: (r: FaceCheckResult) => void;
    getStream?: () => MediaStream | null;
    serverAi?: boolean;
    analyzeMinIntervalMs?: number;
    phoneCheckMinIntervalMs?: number;
    serverHeartbeatEvery?: number;
    onServerAnalysis?: (r: ServerAiAnalysis) => void;
    onServerPhoneCheck?: (r: ServerAiPhoneResult) => void;
    onServerTick?: (r: ServerAiAnalysis & {
        ok: true;
    }) => void;
    onServerError?: (message: string) => void;
    persistServerAi?: boolean;
    referenceImage?: string | null;
    identityThreshold?: number;
}
declare class FaceCheckService {
    private readonly client;
    private readonly sessionId;
    private worker;
    private timer;
    private flushTimer;
    private serverInterval;
    private serverTickInFlight;
    private serverTickSerial;
    private serverCatchUp;
    private queue;
    private running;
    private msgId;
    private opts;
    private monitorThrottle;
    private localCheckCount;
    private localMultiFaceStreak;
    private currentVideo;
    constructor(client: ProctorShieldClient, sessionId: string, opts?: FaceCheckServiceOptions);
    start(video: HTMLVideoElement): void;
    stop(): void;
    get aiState(): {
        monitor: {
            open: boolean;
            failures: number;
            cooldownRemainingMs: number;
        };
    };
    setReferenceImage(dataUrl: string | null): void;
    private captureFrame;
    private captureOnce;
    private enqueueLocal;
    private estimateFaceCountFromDataUrl;
    private runServerAi;
    flush(): Promise<void>;
}

/**
 * Worker source code embedded as a string so the SDK can spin up a
 * Web Worker without needing extra bundler config from the integrator.
 *
 * The worker:
 *   1. Lazily loads `FaceDetector` (Chromium) if available — completely off the main thread.
 *   2. Otherwise falls back to a naive luminance-variance heuristic — still off-thread.
 *   3. Posts back {face_count, detector, ts} for each frame received.
 *
 * Heavy face matching (ArcFace) remains a server call; this worker just
 * answers "is a face present? how many?" at ~10s intervals across 50k+
 * concurrent users without ever blocking React renders.
 */
declare const FACE_CHECK_WORKER_SOURCE = "\nself.faceDetector = null;\nself.detectorKind = 'heuristic';\n\nself.tryInitDetector = async function() {\n  try {\n    if (typeof FaceDetector === 'function') {\n      self.faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });\n      self.detectorKind = 'native_FaceDetector';\n      return true;\n    }\n  } catch (_) {}\n  return false;\n};\n\nself.heuristicFaceCount = function(bitmap) {\n  // Very cheap: read a 32x32 luminance grid, count rows that contain a strong vertical edge.\n  // This is a fallback. It won't beat a real model, but it is non-blocking and very fast.\n  const w = 32, h = 32;\n  const off = new OffscreenCanvas(w, h);\n  const ctx = off.getContext('2d');\n  if (!ctx) return 0;\n  ctx.drawImage(bitmap, 0, 0, w, h);\n  const data = ctx.getImageData(0, 0, w, h).data;\n  const lum = new Float32Array(w*h);\n  for (let i = 0; i < w*h; i++) {\n    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];\n    lum[i] = 0.2126*r + 0.7152*g + 0.0722*b;\n  }\n  let strongRows = 0;\n  for (let y = 0; y < h; y++) {\n    let edges = 0;\n    for (let x = 1; x < w; x++) {\n      if (Math.abs(lum[y*w + x] - lum[y*w + x - 1]) > 22) edges++;\n    }\n    if (edges > 4) strongRows++;\n  }\n  // This fallback is presence-only. Edge density cannot reliably distinguish\n  // a close-up face from multiple people.\n  if (strongRows < 4) return 0;\n  return 1;\n};\n\nself.analyzeBitmap = async function(bitmap) {\n  const ts = Date.now();\n  if (!self.faceDetector) {\n    const ok = await self.tryInitDetector();\n    if (!ok) {\n      const fc = self.heuristicFaceCount(bitmap);\n      return { face_count: fc, detector: 'heuristic', ts };\n    }\n  }\n  try {\n    const faces = await self.faceDetector.detect(bitmap);\n    return { face_count: faces.length, detector: self.detectorKind, ts };\n  } catch (_) {\n    const fc = self.heuristicFaceCount(bitmap);\n    return { face_count: fc, detector: 'heuristic_fallback', ts };\n  }\n};\n\nself.onmessage = async function(e) {\n  const { id, bitmap } = e.data || {};\n  if (!bitmap) {\n    self.postMessage({ id, error: 'no_bitmap' });\n    return;\n  }\n  try {\n    const result = await self.analyzeBitmap(bitmap);\n    self.postMessage({ id, result });\n  } catch (err) {\n    self.postMessage({ id, error: String(err && err.message || err) });\n  } finally {\n    try { bitmap.close && bitmap.close(); } catch(_){}\n  }\n};\n";
declare function createFaceCheckWorker(): Worker | null;

/**
 * Per-session throttle + circuit breaker for the Python AI sidecar.
 *
 * Rules of thumb for ~50k concurrent candidates:
 *   - never escalate more than once per `minIntervalMs` per session per channel
 *   - if the sidecar fails `failureThreshold` times in a row, pause all calls
 *     for `cooldownMs` so a flaky sidecar can't get hammered
 *   - allow opportunistic escalation when something looks suspicious locally,
 *     but still honor the throttle
 */
interface AiSidecarThrottleOptions {
    /** Minimum gap between calls for the same channel; default 30s */
    minIntervalMs?: number;
    /** Consecutive failures before tripping the breaker; default 3 */
    failureThreshold?: number;
    /** How long the breaker stays open; default 60s */
    cooldownMs?: number;
}
declare class AiSidecarThrottle {
    private nextAllowedAt;
    private failures;
    private openedAt;
    private readonly minIntervalMs;
    private readonly failureThreshold;
    private readonly cooldownMs;
    constructor(opts?: AiSidecarThrottleOptions);
    /** Returns true if a call on `channel` may proceed now. */
    allow(channel: string): boolean;
    /** Records that a call has been issued so we don't double-fire. */
    reserve(channel: string): void;
    recordSuccess(): void;
    recordFailure(): void;
    get state(): {
        open: boolean;
        failures: number;
        cooldownRemainingMs: number;
    };
}

interface IdentityCheckResult {
    ts: number;
    similarity: number;
    verified: boolean;
    detector: string;
    source: 'arcface' | 'unknown';
}
interface IdentityCheckServiceOptions {
    /** ms between match attempts; default 10_000 */
    intervalMs?: number;
    /** Minimum ArcFace similarity (0–100); default 55 */
    threshold?: number;
    /** After N consecutive failed matches, raise a hard mismatch violation; default 2 */
    failuresBeforeViolation?: number;
    /** Called for every server response */
    onResult?: (r: IdentityCheckResult) => void;
    /** Called when we cross the consecutive-failure threshold */
    onMismatch?: (r: IdentityCheckResult) => void;
    /** Called the first time a verified result arrives after a mismatch */
    onRestored?: (r: IdentityCheckResult) => void;
    /** Persist results into session_face_checks; default true */
    persist?: boolean;
    getStream?: () => MediaStream | null;
}
/**
 * Runs an ArcFace identity match between the enrolled reference photo and a
 * fresh frame from the candidate's camera every `intervalMs`. Each result is
 * also persisted into `session_face_checks` so the tenant admin sees a live
 * similarity score on the session timeline.
 *
 * Throttled + circuit-broken so 50k concurrent candidates can't slam the
 * Python sidecar.
 */
declare class IdentityCheckService {
    private readonly client;
    private readonly sessionId;
    private readonly referenceDataUrl;
    private timer;
    private throttle;
    private currentVideo;
    private consecutiveFailures;
    private lastVerified;
    private busy;
    private opts;
    constructor(client: ProctorShieldClient, sessionId: string, referenceDataUrl: string, opts?: IdentityCheckServiceOptions);
    start(video: HTMLVideoElement): void;
    stop(): void;
    /** Force a one-shot check, e.g. immediately after the identity step. */
    runOnce(): Promise<IdentityCheckResult | null>;
}

export { AiSidecarThrottle, type AiSidecarThrottleOptions, AudioAnalyzer, CloudInference, FACE_CHECK_WORKER_SOURCE, type FaceCheckResult, FaceCheckService, type FaceCheckServiceOptions, FaceDetector, GazeEstimator, type IdentityCheckResult, IdentityCheckService, type IdentityCheckServiceOptions, LocalInference, ObjectDetector, type ServerAiAnalysis, type ServerAiPhoneResult, createFaceCheckWorker };
