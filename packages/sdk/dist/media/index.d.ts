import { P as ProctorShieldClient } from '../ProctorShieldClient-DAMa3Xag.js';
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
    private buffer;
    constructor(opts: ChunkedRecorderOptions);
    start(stream: MediaStream): void;
    stop(): void;
}
/**
 * Helper: builds an onChunk handler that signals chunk metadata to the API.
 * Object storage upload is left to the integrator (presigned URL, etc.).
 */
declare function buildChunkSignaler(client: ProctorShieldClient, sessionId: string): ({ blob, sequence, track, startedAt, endedAt, }: {
    blob: Blob;
    sequence: number;
    track: RecordingTrack;
    startedAt: string;
    endedAt: string;
}) => Promise<void>;

export { ChunkedRecorder, type ChunkedRecorderOptions, MediaRecorderWrapper, type RecordingTrack, TURNResolver, WebRTCManager, buildChunkSignaler, captureVideoFrame };
