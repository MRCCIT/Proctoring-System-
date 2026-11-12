/**
 * Tier-1 chunk upload helper: MediaRecorder chunks → presign → PUT → complete.
 * App servers must never proxy video bytes; uploads go direct to object storage.
 */

export interface PresignResponse {
  upload_url: string;
  object_key: string;
  headers?: Record<string, string>;
  complete_path?: string;
  expires_in?: number;
}

export interface PendingChunk {
  sessionId: string;
  track: string;
  index: number;
  blob: Blob;
  mimeType: string;
  idempotencyKey: string;
}

export interface ChunkUploaderTransport {
  presign(chunk: PendingChunk): Promise<PresignResponse>;
  complete?(chunk: PendingChunk, presign: PresignResponse): Promise<void>;
}

export interface ChunkUploaderOptions {
  transport: ChunkUploaderTransport;
  maxRetries?: number;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function createFetchChunkTransport(opts: {
  baseUrl: string;
  getToken: () => string | null | undefined;
  /** Use /v1/sdk/sessions when using X-Session-Token (default true). */
  useSdkPath?: boolean;
}): ChunkUploaderTransport {
  const base = opts.baseUrl.replace(/\/$/, '');
  const useSdk = opts.useSdkPath !== false;
  const sessionBase = (sessionId: string) =>
    useSdk ? `${base}/v1/sdk/sessions/${sessionId}` : `${base}/v1/sessions/${sessionId}`;
  return {
    async presign(chunk) {
      const token = opts.getToken();
      const res = await fetch(`${sessionBase(chunk.sessionId)}/media/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Session-Token': token } : {}),
        },
        body: JSON.stringify({
          track: chunk.track,
          index: chunk.index,
          mime_type: chunk.mimeType,
          idempotency_key: chunk.idempotencyKey,
        }),
      });
      if (!res.ok) throw new Error(`presign ${res.status}`);
      return (await res.json()) as PresignResponse;
    },
    async complete(chunk, presign) {
      const token = opts.getToken();
      const path =
        presign.complete_path ||
        (useSdk
          ? `/v1/sdk/sessions/${chunk.sessionId}/media/chunk-complete`
          : `/v1/sessions/${chunk.sessionId}/media/chunk-complete`);
      const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Session-Token': token } : {}),
        },
        body: JSON.stringify({
          object_key: presign.object_key,
          track: chunk.track,
          index: chunk.index,
          idempotency_key: chunk.idempotencyKey,
        }),
      });
      if (!res.ok) throw new Error(`chunk-complete ${res.status}`);
    },
  };
}

export class ChunkUploader {
  private readonly transport: ChunkUploaderTransport;
  private readonly maxRetries: number;
  private queue: PendingChunk[] = [];
  private pumping = false;

  constructor(opts: ChunkUploaderOptions) {
    this.transport = opts.transport;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  enqueue(chunk: PendingChunk) {
    this.queue.push(chunk);
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    while (this.queue.length) {
      const chunk = this.queue[0]!;
      let attempt = 0;
      for (;;) {
        try {
          const presign = await this.transport.presign(chunk);
          await fetch(presign.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': chunk.mimeType, ...(presign.headers || {}) },
            body: chunk.blob,
          });
          await this.transport.complete?.(chunk, presign);
          this.queue.shift();
          break;
        } catch {
          attempt += 1;
          if (attempt >= this.maxRetries) {
            this.queue.shift();
            break;
          }
          await new Promise((r) => setTimeout(r, Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200));
        }
      }
    }
    this.pumping = false;
  }
}
