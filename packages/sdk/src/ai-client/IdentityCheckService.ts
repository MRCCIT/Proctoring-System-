import { AiSidecarThrottle } from './AiSidecarThrottle';
import { captureFrameFromStream } from '../media/captureFrame';
import type { ProctorShieldClient } from '../core/ProctorShieldClient';
import { DEFAULT_IDENTITY_MIN_SIMILARITY, isIdentityVerified, normalizeMinSimilarity } from './identityMatch';

export interface IdentityCheckResult {
  ts: number;
  similarity: number;
  verified: boolean;
  detector: string;
  source: 'arcface' | 'unknown';
}

export interface IdentityCheckServiceOptions {
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

interface ServerCompareResponse {
  data?: {
    similarity?: number;
    verified?: boolean;
    detector?: string;
  };
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
export class IdentityCheckService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private throttle = new AiSidecarThrottle({ minIntervalMs: 9_000, failureThreshold: 4, cooldownMs: 30_000 });
  private currentVideo: HTMLVideoElement | null = null;
  private consecutiveFailures = 0;
  private lastVerified = true;
  private busy = false;

  private opts: Required<Omit<IdentityCheckServiceOptions, 'onResult' | 'onMismatch' | 'onRestored' | 'getStream'>> & {
    onResult: (r: IdentityCheckResult) => void;
    onMismatch: (r: IdentityCheckResult) => void;
    onRestored: (r: IdentityCheckResult) => void;
    getStream: () => MediaStream | null;
  };

  constructor(
    private readonly client: ProctorShieldClient,
    private readonly sessionId: string,
    private readonly referenceDataUrl: string,
    opts: IdentityCheckServiceOptions = {}
  ) {
    this.opts = {
      intervalMs: opts.intervalMs ?? 10_000,
      threshold: opts.threshold ?? DEFAULT_IDENTITY_MIN_SIMILARITY,
      failuresBeforeViolation: opts.failuresBeforeViolation ?? 2,
      persist: opts.persist ?? true,
      getStream: opts.getStream ?? (() => null),
      onResult: opts.onResult ?? (() => {}),
      onMismatch: opts.onMismatch ?? (() => {}),
      onRestored: opts.onRestored ?? (() => {}),
    };
  }

  start(video: HTMLVideoElement) {
    if (this.timer) return;
    this.currentVideo = video;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.opts.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.currentVideo = null;
  }

  /** Force a one-shot check, e.g. immediately after the identity step. */
  async runOnce(): Promise<IdentityCheckResult | null> {
    if (this.busy) return null;
    if (!this.currentVideo) return null;
    if (!this.throttle.allow('identity')) return null;

    const img = await captureFrameFromStream(this.opts.getStream(), this.currentVideo);
    if (!img) return null;

    this.busy = true;
    this.throttle.reserve('identity');
    try {
      const resp = (await this.client.faceCompareAi(this.sessionId, {
        reference_image: this.referenceDataUrl,
        live_image: img,
        identity_threshold: this.opts.threshold,
      })) as ServerCompareResponse;
      this.throttle.recordSuccess();
      const sim = Number(resp?.data?.similarity ?? 0);
      const min = normalizeMinSimilarity(this.opts.threshold);
      const verified = isIdentityVerified(resp?.data, min);
      const result: IdentityCheckResult = {
        ts: Date.now(),
        similarity: sim,
        verified,
        detector: String(resp?.data?.detector || 'arcface'),
        source: 'arcface',
      };

      this.opts.onResult(result);

      if (this.opts.persist) {
        void this.client
          .postFaceChecks(this.sessionId, [
            {
              face_count: 1,
              match_score: result.similarity,
              detector: result.detector,
              source: 'identity_check',
              violations: verified ? [] : ['identity_mismatch'],
              occurred_at: new Date(result.ts).toISOString(),
            },
          ])
          .catch(() => {});
      }

      if (!verified) {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= this.opts.failuresBeforeViolation && this.lastVerified) {
          this.lastVerified = false;
          this.opts.onMismatch(result);
        }
      } else {
        this.consecutiveFailures = 0;
        if (!this.lastVerified) {
          this.lastVerified = true;
          this.opts.onRestored(result);
        }
      }
      return result;
    } catch {
      this.throttle.recordFailure();
      return null;
    } finally {
      this.busy = false;
    }
  }

}
