import { P as ProctorShieldClient } from '../ProctorShieldClient-B8list-d.js';
export { A as AcquiredStreams, P as PermissionKind, a as PermissionManager, b as PermissionState, c as PermissionStatus } from '../PermissionManager--3wybVk2.js';

declare class WebRTCManager {
    private readonly client;
    private readonly turn;
    constructor(client: ProctorShieldClient);
    createPeerConnection(): Promise<RTCPeerConnection>;
}

declare class TURNResolver {
    private readonly client;
    constructor(client: ProctorShieldClient);
    resolve(): Promise<{
        ice_servers?: RTCIceServer[];
    } | undefined>;
}

declare class MediaRecorderWrapper {
    private recorder;
    start(stream: MediaStream, onChunk: (blob: Blob) => void): void;
    stop(): void;
}

declare function captureVideoFrame(video: HTMLVideoElement): Promise<string>;

type RecordingTrack = 'camera' | 'screen' | 'audio' | 'composite';
interface ChunkedRecorderOptions {
    /** Length of each chunk in ms (default 10s) */
    chunkMs?: number;
    /** Track label (camera/screen/...) */
    track: RecordingTrack;
    /** Mime preference list, first supported is used */
    mimeTypes?: string[];
    /** Called when the next chunk is ready – usually upload to object storage */
    onChunk?: (info: {
        blob: Blob;
        sequence: number;
        track: RecordingTrack;
        startedAt: string;
        endedAt: string;
    }) => void | Promise<void>;
}
/**
 * Records a MediaStream to consecutive chunks. Each finished chunk is fired
 * to onChunk() so callers can upload + signal it to the backend. This keeps
 * memory usage bounded even for multi-hour exams and survives short failures.
 */
declare class ChunkedRecorder {
    private readonly opts;
    private recorder;
    private sequence;
    private currentChunkStart;
    private mimeType;
    private stopResolve;
    constructor(opts: ChunkedRecorderOptions);
    start(stream: MediaStream): void;
    /** Flush the final timeslice and wait for upload before session teardown. */
    stop(): Promise<void>;
}
/**
 * Helper: builds an onChunk handler that uploads each chunk's bytes to the
 * platform API as base64. The API persists them under STORAGE_DIR so the
 * tenant admin can play them back later.
 *
 * Skips the payload for chunks larger than `maxBytes` (default 12 MB) and
 * just signals metadata so we never break the JSON body limit.
 */
interface ChunkSignalerOptions {
    /** Skip the binary payload above this size; default 12 MB */
    maxBytes?: number;
    /** Send only metadata, no binary payload */
    metadataOnly?: boolean;
}
declare function buildChunkSignaler(client: ProctorShieldClient, sessionId: string, opts?: ChunkSignalerOptions): ({ blob, sequence, track, startedAt, endedAt, }: {
    blob: Blob;
    sequence: number;
    track: RecordingTrack;
    startedAt: string;
    endedAt: string;
}) => Promise<void>;

export { ChunkedRecorder, type ChunkedRecorderOptions, MediaRecorderWrapper, type RecordingTrack, TURNResolver, WebRTCManager, buildChunkSignaler, captureVideoFrame };
