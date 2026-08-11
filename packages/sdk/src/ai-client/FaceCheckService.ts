import { createFaceCheckWorker } from './FaceCheckWorker';
import { AiSidecarThrottle } from './AiSidecarThrottle';
import { captureFrameForAi, captureFrameFromStream, dataUrlToImageBitmap } from '../media/captureFrame';
import type { ProctorShieldClient } from '../core/ProctorShieldClient';
import { DEFAULT_IDENTITY_MIN_SIMILARITY, normalizeMinSimilarity } from './identityMatch';

export interface FaceCheckResult {
  face_count: number;
  detector: string;
  ts: number;
  violations: string[];
}

export interface ServerAiAnalysis {
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

export interface ServerAiPhoneResult {
  phone_detected: boolean;
  yolo_enabled: boolean;
}

export interface FaceCheckServiceOptions {
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
  onServerTick?: (r: ServerAiAnalysis & { ok: true }) => void;
  onServerError?: (message: string) => void;
  persistServerAi?: boolean;
  referenceImage?: string | null;
  identityThreshold?: number;
}

type Resolved = Required<
  Omit<
    FaceCheckServiceOptions,
    | 'onResult'
    | 'onServerAnalysis'
    | 'onServerPhoneCheck'
    | 'onServerTick'
    | 'onServerError'
    | 'getStream'
    | 'referenceImage'
  >
> & {
  onResult: (r: FaceCheckResult) => void;
  onServerAnalysis: (r: ServerAiAnalysis) => void;
  onServerPhoneCheck: (r: ServerAiPhoneResult) => void;
  onServerTick: (r: ServerAiAnalysis & { ok: true }) => void;
  onServerError: (message: string) => void;
  getStream: () => MediaStream | null;
  referenceImage: string | null;
};

export class FaceCheckService {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private serverInterval: ReturnType<typeof setInterval> | null = null;
  private serverTickInFlight = false;
  private serverTickSerial = 0;
  private serverCatchUp = false;
  private queue: FaceCheckResult[] = [];
  private running = false;
  private msgId = 0;
  private opts: Resolved;
  private monitorThrottle: AiSidecarThrottle;
  private localCheckCount = 0;
  private currentVideo: HTMLVideoElement | null = null;

  constructor(
    private readonly client: ProctorShieldClient,
    private readonly sessionId: string,
    opts: FaceCheckServiceOptions = {}
  ) {
    this.opts = {
      intervalMs: opts.intervalMs ?? 10_000,
      flushAt: opts.flushAt ?? 6,
      flushIntervalMs: opts.flushIntervalMs ?? 30_000,
      onResult: opts.onResult ?? (() => {}),
      getStream: opts.getStream ?? (() => null),
      serverAi: opts.serverAi ?? false,
      analyzeMinIntervalMs: opts.analyzeMinIntervalMs ?? 500,
      phoneCheckMinIntervalMs: opts.phoneCheckMinIntervalMs ?? 1_000,
      serverHeartbeatEvery: opts.serverHeartbeatEvery ?? 3,
      onServerAnalysis: opts.onServerAnalysis ?? (() => {}),
      onServerPhoneCheck: opts.onServerPhoneCheck ?? (() => {}),
      onServerTick: opts.onServerTick ?? (() => {}),
      onServerError: opts.onServerError ?? (() => {}),
      persistServerAi: opts.persistServerAi ?? true,
      referenceImage: opts.referenceImage ?? null,
      identityThreshold: opts.identityThreshold ?? DEFAULT_IDENTITY_MIN_SIMILARITY,
    };
    this.monitorThrottle = new AiSidecarThrottle({
      minIntervalMs: 0,
      failureThreshold: 12,
      cooldownMs: 10_000,
    });
  }

  start(video: HTMLVideoElement) {
    if (this.running) return;
    this.running = true;
    this.currentVideo = video;
    this.worker = createFaceCheckWorker();
    this.timer = setInterval(() => void this.captureOnce(video), this.opts.intervalMs);
    this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs);
    if (this.opts.serverAi) {
      void this.runServerAi('heartbeat');
      this.serverInterval = setInterval(
        () => void this.runServerAi('heartbeat'),
        this.opts.analyzeMinIntervalMs
      );
    }
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.serverInterval) clearInterval(this.serverInterval);
    this.timer = null;
    this.flushTimer = null;
    this.serverInterval = null;
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    this.currentVideo = null;
    void this.flush();
  }

  get aiState() {
    return { monitor: this.monitorThrottle.state };
  }

  setReferenceImage(dataUrl: string | null) {
    this.opts.referenceImage = dataUrl;
  }

  private async captureFrame(): Promise<string | null> {
    const stream = this.opts.getStream();
    const video = this.currentVideo;
    if (!stream && !video) return null;
    return captureFrameForAi(stream, video);
  }

  private async captureOnce(video: HTMLVideoElement) {
    if (!this.worker) return;
    try {
      const dataUrl = await captureFrameFromStream(this.opts.getStream(), video, { maxWidth: 320, quality: 0.7 });
      if (!dataUrl) return;

      const bitmap = await dataUrlToImageBitmap(dataUrl);
      if (bitmap) {
        const id = ++this.msgId;
        const promise = new Promise<{ face_count: number; detector: string; ts: number } | null>((resolve) => {
          const handler = (e: MessageEvent) => {
            if (e.data?.id !== id) return;
            this.worker?.removeEventListener('message', handler);
            resolve(e.data.result || null);
          };
          this.worker?.addEventListener('message', handler);
          setTimeout(() => {
            this.worker?.removeEventListener('message', handler);
            resolve(null);
          }, 2500);
        });
        this.worker.postMessage({ id, bitmap }, [bitmap as unknown as Transferable]);
        const res = await promise;
        if (res) {
          const violations: string[] = [];
          if (res.face_count === 0) violations.push('no_face_detected');
          if (res.face_count > 1) violations.push('multiple_faces_detected');
          const result: FaceCheckResult = { ...res, violations };
          this.enqueueLocal(result);
          if (this.opts.serverAi && violations.length) void this.runServerAi('suspicious');
          return;
        }
      }

      const fc = await this.estimateFaceCountFromDataUrl(dataUrl);
      const violations: string[] = [];
      if (fc === 0) violations.push('no_face_detected');
      if (fc > 1) violations.push('multiple_faces_detected');
      this.enqueueLocal({
        face_count: fc,
        detector: 'canvas_fallback',
        ts: Date.now(),
        violations,
      });
      if (this.opts.serverAi && violations.length) void this.runServerAi('suspicious');
    } catch {
      /* never let one bad frame kill the loop */
    }
  }

  private enqueueLocal(result: FaceCheckResult) {
    this.queue.push(result);
    this.opts.onResult(result);
    this.localCheckCount += 1;
    if (this.queue.length >= this.opts.flushAt) void this.flush();
  }

  private async estimateFaceCountFromDataUrl(dataUrl: string): Promise<number> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = 160;
          const h = Math.round((img.height / img.width) * w) || 120;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(1);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          let skin = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) skin += 1;
          }
          const ratio = skin / (w * h);
          if (ratio < 0.08) resolve(0);
          else if (ratio > 0.35) resolve(2);
          else resolve(1);
        } catch {
          resolve(1);
        }
      };
      img.onerror = () => resolve(1);
      img.src = dataUrl;
    });
  }

  private async runServerAi(_reason: 'heartbeat' | 'suspicious') {
    if (!this.opts.serverAi || !this.running) return;
    if (this.serverTickInFlight) {
      this.serverCatchUp = true;
      return;
    }

    if (!this.monitorThrottle.allow('monitor')) {
      const st = this.monitorThrottle.state;
      if (st.open) {
        this.opts.onServerError(`AI paused (circuit open, retry in ${Math.ceil(st.cooldownRemainingMs / 1000)}s)`);
      }
      return;
    }

    const tickId = ++this.serverTickSerial;
    this.serverTickInFlight = true;

    try {
      const img = await this.captureFrame();
      if (!img || tickId !== this.serverTickSerial) return;

      const body: {
        reference_image?: string;
        identity_threshold?: number;
        load_reference?: boolean;
      } = { load_reference: true };
      if (this.opts.referenceImage) {
        body.reference_image = this.opts.referenceImage;
        body.load_reference = false;
      }
      body.identity_threshold = normalizeMinSimilarity(this.opts.identityThreshold);

      const r = await this.client.monitorTickAi(this.sessionId, img, this.opts.persistServerAi, body);
      if (tickId !== this.serverTickSerial) return;

      this.monitorThrottle.recordSuccess();

      const payload = r?.data as { analysis?: ServerAiAnalysis } | ServerAiAnalysis | undefined;
      const analysis = (
        payload && typeof payload === 'object' && 'analysis' in payload
          ? payload.analysis
          : payload
      ) as ServerAiAnalysis | undefined;

      if (!analysis || typeof analysis !== 'object' || !('face_count' in analysis)) {
        this.opts.onServerError('AI returned an empty analysis payload');
        return;
      }

      this.opts.onServerAnalysis(analysis);
      this.opts.onServerTick({
        ...analysis,
        ok: true,
      });
      this.opts.onServerPhoneCheck({
        phone_detected: Boolean(analysis.phone_detected),
        yolo_enabled: Boolean((analysis as { phone_yolo_enabled?: boolean }).phone_yolo_enabled),
      });
    } catch (e) {
      this.monitorThrottle.recordFailure();
      this.opts.onServerError((e as Error).message || 'AI monitor-tick failed');
    } finally {
      this.serverTickInFlight = false;
      if (this.serverCatchUp && this.running) {
        this.serverCatchUp = false;
        void this.runServerAi('heartbeat');
      }
    }
  }

  async flush() {
    if (!this.queue.length) return;
    const items = this.queue.splice(0, this.queue.length).map((r) => ({
      face_count: r.face_count,
      detector: r.detector,
      occurred_at: new Date(r.ts).toISOString(),
      violations: r.violations,
      source: 'local_worker',
    }));
    try {
      await this.client.postFaceChecks(this.sessionId, items);
    } catch {
      this.queue.unshift(
        ...items.map((it) => ({
          face_count: Number(it.face_count) || 0,
          detector: String(it.detector || 'unknown'),
          ts: new Date(it.occurred_at as string).getTime(),
          violations: (it.violations as string[]) || [],
        }))
      );
    }
  }
}
