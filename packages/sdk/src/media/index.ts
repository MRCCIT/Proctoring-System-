export { WebRTCManager } from './WebRTCManager';
export { TURNResolver } from './TURNResolver';
export { LiveVideoSignaling } from './LiveVideoSignaling';
export type { LiveVideoRole, LiveVideoSignalingOptions } from './LiveVideoSignaling';
export { MediaRecorderWrapper } from './MediaRecorder';
export { captureVideoFrame } from './SnapshotCapture';
export {
  PermissionManager,
  PREFERRED_CAMERA_CONSTRAINTS,
  PREFERRED_SCREEN_CONSTRAINTS,
} from './PermissionManager';
export type { PermissionStatus, PermissionState, AcquiredStreams, PermissionKind } from './PermissionManager';
export {
  ChunkedRecorder,
  buildChunkSignaler,
  pickMime,
  PREFERRED_RECORDING_MIMES,
  CONCAT_SAFE_RECORDING_MIMES,
} from './ChunkedRecorder';
export type { RecordingTrack, ChunkedRecorderOptions } from './ChunkedRecorder';
// Phase 5: chunk uploader (presign -> upload -> complete) + adaptive snapshot ticker.
export { ChunkUploader, createFetchChunkTransport, blobToBase64 } from './chunkUploader';
export type { PendingChunk, PresignResponse, ChunkUploaderTransport, ChunkUploaderOptions } from './chunkUploader';
export { SnapshotTicker, clampSnapshotInterval, localIntervalMs, SNAPSHOT_MIN_MS, SNAPSHOT_MAX_MS } from './snapshotTicker';
export type { SnapshotTickerOptions, SnapshotUploadResult } from './snapshotTicker';
