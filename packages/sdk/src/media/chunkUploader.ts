/**
 * Tier-1 chunk upload helper: MediaRecorder chunks → presign → PUT → complete.
 * Includes in-memory retry + IndexedDB pending queue so refresh can resume.
 * Never stops recording on upload failure — callers should keep capturing.
 */

export interface PresignResponse {
  upload_url?: string;
  object_key: string;
  headers?: Record<string, string>;
  complete_path?: string;
  expires_in?: number;
  use_api_base64?: boolean;
  storage?: string;
}

export interface PendingChunk {
  sessionId: string;
  track: string;
  index: number;
  blob: Blob;
  mimeType: string;
  idempotencyKey: string;
  startedAt?: string;
  endedAt?: string;
}

export interface ChunkUploaderTransport {
  presign(chunk: PendingChunk): Promise<PresignResponse>;
  complete?(chunk: PendingChunk, presign: PresignResponse): Promise<void>;
}

export interface ChunkUploaderOptions {
  transport: ChunkUploaderTransport;
  maxRetries?: number;
  /** When set, failed/pending chunks persist across reloads */
  idbName?: string;
  /** Fallback when presign returns use_api_base64 / no upload_url */
  fallbackUpload?: (chunk: PendingChunk) => Promise<void>;
}

const IDB_STORE = 'pending_chunks';

function openIdb(name: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'idempotencyKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(db: IDBDatabase | null, chunk: PendingChunk) {
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(chunk);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDelete(db: IDBDatabase | null, key: string) {
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbAll(db: IDBDatabase | null): Promise<PendingChunk[]> {
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []) as PendingChunk[]);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
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
  private readonly fallbackUpload?: (chunk: PendingChunk) => Promise<void>;
  private queue: PendingChunk[] = [];
  private pumping = false;
  private db: IDBDatabase | null = null;
  private ready: Promise<void>;

  constructor(opts: ChunkUploaderOptions) {
    this.transport = opts.transport;
    this.maxRetries = opts.maxRetries ?? 5;
    this.fallbackUpload = opts.fallbackUpload;
    this.ready = (async () => {
      if (!opts.idbName) return;
      this.db = await openIdb(opts.idbName);
      const pending = await idbAll(this.db);
      for (const c of pending) this.queue.push(c);
      if (this.queue.length) void this.pump();
    })();
  }

  async whenReady() {
    await this.ready;
  }

  enqueue(chunk: PendingChunk) {
    this.queue.push(chunk);
    void idbPut(this.db, chunk);
    void this.pump();
  }

  private async uploadOne(chunk: PendingChunk) {
    const presign = await this.transport.presign(chunk);
    if (presign.use_api_base64 || !presign.upload_url) {
      if (!this.fallbackUpload) throw new Error('presign requires api base64 fallback');
      await this.fallbackUpload(chunk);
      return;
    }
    const put = await fetch(presign.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': chunk.mimeType, ...(presign.headers || {}) },
      body: chunk.blob,
    });
    if (!put.ok) throw new Error(`put ${put.status}`);
    await this.transport.complete?.(chunk, presign);
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    await this.ready;
    while (this.queue.length) {
      const chunk = this.queue[0]!;
      let attempt = 0;
      let ok = false;
      for (;;) {
        try {
          await this.uploadOne(chunk);
          ok = true;
          break;
        } catch {
          attempt += 1;
          if (attempt >= this.maxRetries) break;
          await new Promise((r) => setTimeout(r, Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200));
        }
      }
      this.queue.shift();
      if (ok) {
        await idbDelete(this.db, chunk.idempotencyKey);
      } else if (this.fallbackUpload) {
        try {
          await this.fallbackUpload(chunk);
          await idbDelete(this.db, chunk.idempotencyKey);
        } catch {
          // Keep in IDB for a later session resume; drop from memory to avoid tight loop
          await idbPut(this.db, chunk);
        }
      }
    }
    this.pumping = false;
  }
}
