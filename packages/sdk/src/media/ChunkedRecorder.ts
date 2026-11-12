import type { ProctorShieldClient } from '../core/ProctorShieldClient';

export type RecordingTrack = 'camera' | 'screen' | 'audio' | 'composite';

export interface ChunkedRecorderOptions {
  /** Length of each chunk in ms (default 10s) */
  chunkMs?: number;
  /** Track label (camera/screen/...) */
  track: RecordingTrack;
  /** Mime preference list, first supported is used */
  mimeTypes?: string[];
  /**
   * Target bitrate for MediaRecorder (bits/sec). Lower = smaller uploads.
   * Defaults: camera ~900kbps, screen ~1.2Mbps when unset by caller.
   */
  bitsPerSecond?: number;
  /** Called when the next chunk is ready – usually upload to object storage */
  onChunk?: (info: { blob: Blob; sequence: number; track: RecordingTrack; startedAt: string; endedAt: string }) => void | Promise<void>;
}

/** VP8 first — consecutive WebM timeslice blobs concatenate more reliably for server merge. */
const DEFAULT_MIMES = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/webm;codecs=vp9,opus', 'video/mp4'];

function pickMime(list: string[]): string | undefined {
  for (const m of list) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

/**
 * Records a MediaStream to consecutive chunks. Each finished chunk is fired
 * to onChunk() so callers can upload + signal it to the backend. This keeps
 * memory usage bounded even for multi-hour exams and survives short failures.
 */
export class ChunkedRecorder {
  private recorder: MediaRecorder | null = null;
  private sequence = 0;
  private currentChunkStart = 0;
  private mimeType = 'video/webm';
  private stopResolve: (() => void) | null = null;

  constructor(private readonly opts: ChunkedRecorderOptions) {}

  start(stream: MediaStream) {
    if (this.recorder) return;
    const chunkMs = this.opts.chunkMs ?? 10_000;
    const mime = pickMime(this.opts.mimeTypes ?? DEFAULT_MIMES);
    this.mimeType = mime || 'video/webm';
    const defaultBps = this.opts.track === 'screen' ? 1_200_000 : 900_000;
    const bitsPerSecond = this.opts.bitsPerSecond ?? defaultBps;
    const recOpts: MediaRecorderOptions = mime ? { mimeType: mime, bitsPerSecond } : { bitsPerSecond };
    try {
      this.recorder = new MediaRecorder(stream, recOpts);
    } catch {
      // Some browsers reject bitsPerSecond with certain codecs — fall back to mime-only.
      this.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    }
    this.currentChunkStart = Date.now();
    this.recorder.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const endedAt = Date.now();
      const blob = new Blob([e.data], { type: e.data.type || this.mimeType });
      const sequence = this.sequence++;
      const startedAt = new Date(this.currentChunkStart).toISOString();
      this.currentChunkStart = endedAt;
      try {
        await this.opts.onChunk?.({
          blob,
          sequence,
          track: this.opts.track,
          startedAt,
          endedAt: new Date(endedAt).toISOString(),
        });
      } catch {
        /* one bad upload should not kill the recorder */
      }
    };
    this.recorder.onstop = () => {
      this.recorder = null;
      const done = this.stopResolve;
      this.stopResolve = null;
      done?.();
    };
    this.recorder.start(chunkMs);
  }

  /** Flush the final timeslice and wait for upload before session teardown. */
  stop(): Promise<void> {
    const rec = this.recorder;
    if (!rec || rec.state === 'inactive') {
      this.recorder = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.stopResolve = null;
        resolve();
      }, 8000);
      this.stopResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
      try {
        if (rec.state === 'recording') rec.requestData();
        rec.stop();
      } catch {
        clearTimeout(timeout);
        this.recorder = null;
        this.stopResolve = null;
        resolve();
      }
    });
  }
}

/**
 * Helper: builds an onChunk handler that uploads each chunk's bytes to the
 * platform API as base64. The API persists them under STORAGE_DIR so the
 * tenant admin can play them back later.
 *
 * Skips the payload for chunks larger than `maxBytes` (default 12 MB) and
 * just signals metadata so we never break the JSON body limit.
 */
export interface ChunkSignalerOptions {
  /** Skip the binary payload above this size; default 12 MB */
  maxBytes?: number;
  /** Send only metadata, no binary payload */
  metadataOnly?: boolean;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function buildChunkSignaler(
  client: ProctorShieldClient,
  sessionId: string,
  opts: ChunkSignalerOptions = {}
) {
  const maxBytes = opts.maxBytes ?? 12 * 1024 * 1024;
  return async ({
    blob,
    sequence,
    track,
    startedAt,
    endedAt,
  }: {
    blob: Blob;
    sequence: number;
    track: RecordingTrack;
    startedAt: string;
    endedAt: string;
  }) => {
    const sendBinary = !opts.metadataOnly && blob.size > 0 && blob.size <= maxBytes;
    const payload_base64 = sendBinary ? await blobToBase64(blob) : undefined;
    await client.postRecordingChunk(sessionId, {
      track,
      sequence,
      bytes: blob.size,
      duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
      started_at: startedAt,
      ended_at: endedAt,
      mime_type: blob.type || 'video/webm',
      metadata: { mime: blob.type, persisted: sendBinary },
      payload_base64,
    });
  };
}
