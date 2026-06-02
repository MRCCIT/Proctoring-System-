import { P as ProctorShieldClient } from '../ProctorShieldClient-DAMa3Xag.cjs';

/** WASM placeholder — wire ONNX/MediaPipe WASM when available */
declare class LocalInference {
    analyzeFrame(_imageDataUrl: string): Promise<{
        violations: string[];
    }>;
}

declare class CloudInference {
    private readonly client;
    constructor(client: ProctorShieldClient);
    analyzeFrame(sessionId: string, imageDataUrl: string, persist?: boolean): Promise<unknown>;
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
interface FaceCheckServiceOptions {
    /** ms between checks; default 10_000 */
    intervalMs?: number;
    /** Max queued before we flush; default 6 */
    flushAt?: number;
    /** ms between server uploads regardless of queue; default 30_000 */
    flushIntervalMs?: number;
    /** Called for each local result so UI can react instantly */
    onResult?: (r: FaceCheckResult) => void;
}
/**
 * Off-thread face-presence loop. Runs every 10s, samples a single
 * <video> frame, ships it to a Web Worker for analysis, and batches
 * results into a single API call every flushIntervalMs. The main
 * React tree never sees the heavy work — perfect for 50k+ concurrent
 * candidates.
 */
declare class FaceCheckService {
    private readonly client;
    private readonly sessionId;
    private worker;
    private timer;
    private flushTimer;
    private queue;
    private running;
    private msgId;
    private opts;
    constructor(client: ProctorShieldClient, sessionId: string, opts?: FaceCheckServiceOptions);
    start(video: HTMLVideoElement): void;
    stop(): void;
    private captureOnce;
    private captureBitmap;
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
declare const FACE_CHECK_WORKER_SOURCE = "\nself.faceDetector = null;\nself.detectorKind = 'heuristic';\n\nself.tryInitDetector = async function() {\n  try {\n    if (typeof FaceDetector === 'function') {\n      self.faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });\n      self.detectorKind = 'native_FaceDetector';\n      return true;\n    }\n  } catch (_) {}\n  return false;\n};\n\nself.heuristicFaceCount = function(bitmap) {\n  // Very cheap: read a 32x32 luminance grid, count rows that contain a strong vertical edge.\n  // This is a fallback. It won't beat a real model, but it is non-blocking and very fast.\n  const w = 32, h = 32;\n  const off = new OffscreenCanvas(w, h);\n  const ctx = off.getContext('2d');\n  if (!ctx) return 0;\n  ctx.drawImage(bitmap, 0, 0, w, h);\n  const data = ctx.getImageData(0, 0, w, h).data;\n  const lum = new Float32Array(w*h);\n  for (let i = 0; i < w*h; i++) {\n    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];\n    lum[i] = 0.2126*r + 0.7152*g + 0.0722*b;\n  }\n  let strongRows = 0;\n  for (let y = 0; y < h; y++) {\n    let edges = 0;\n    for (let x = 1; x < w; x++) {\n      if (Math.abs(lum[y*w + x] - lum[y*w + x - 1]) > 22) edges++;\n    }\n    if (edges > 4) strongRows++;\n  }\n  // Map \"rows with edges\" to a coarse face_count estimate.\n  if (strongRows < 4) return 0;\n  if (strongRows < 18) return 1;\n  return 2;\n};\n\nself.analyzeBitmap = async function(bitmap) {\n  const ts = Date.now();\n  if (!self.faceDetector) {\n    const ok = await self.tryInitDetector();\n    if (!ok) {\n      const fc = self.heuristicFaceCount(bitmap);\n      return { face_count: fc, detector: 'heuristic', ts };\n    }\n  }\n  try {\n    const faces = await self.faceDetector.detect(bitmap);\n    return { face_count: faces.length, detector: self.detectorKind, ts };\n  } catch (_) {\n    const fc = self.heuristicFaceCount(bitmap);\n    return { face_count: fc, detector: 'heuristic_fallback', ts };\n  }\n};\n\nself.onmessage = async function(e) {\n  const { id, bitmap } = e.data || {};\n  if (!bitmap) {\n    self.postMessage({ id, error: 'no_bitmap' });\n    return;\n  }\n  try {\n    const result = await self.analyzeBitmap(bitmap);\n    self.postMessage({ id, result });\n  } catch (err) {\n    self.postMessage({ id, error: String(err && err.message || err) });\n  } finally {\n    try { bitmap.close && bitmap.close(); } catch(_){}\n  }\n};\n";
declare function createFaceCheckWorker(): Worker | null;

export { AudioAnalyzer, CloudInference, FACE_CHECK_WORKER_SOURCE, type FaceCheckResult, FaceCheckService, type FaceCheckServiceOptions, FaceDetector, GazeEstimator, LocalInference, ObjectDetector, createFaceCheckWorker };
