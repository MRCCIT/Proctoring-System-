export { WebRTCManager } from './WebRTCManager';
export { TURNResolver } from './TURNResolver';
export { LiveVideoSignaling } from './LiveVideoSignaling';
export type { LiveVideoRole, LiveVideoSignalingOptions } from './LiveVideoSignaling';
export { MediaRecorderWrapper } from './MediaRecorder';
export { captureVideoFrame } from './SnapshotCapture';
export { PermissionManager } from './PermissionManager';
export type { PermissionStatus, PermissionState, AcquiredStreams, PermissionKind } from './PermissionManager';
export { ChunkedRecorder, buildChunkSignaler } from './ChunkedRecorder';
export type { RecordingTrack, ChunkedRecorderOptions } from './ChunkedRecorder';
// Phase 5: chunk uploader (presign -> upload -> complete) + adaptive snapshot ticker.
export { ChunkUploader, createFetchChunkTransport, blobToBase64 } from './chunkUploader';
export type { PendingChunk, PresignResponse, ChunkUploaderTransport, ChunkUploaderOptions } from './chunkUploader';
export { SnapshotTicker, clampSnapshotInterval, localIntervalMs, SNAPSHOT_MIN_MS, SNAPSHOT_MAX_MS } from './snapshotTicker';
export type { SnapshotTickerOptions, SnapshotUploadResult } from './snapshotTicker';
