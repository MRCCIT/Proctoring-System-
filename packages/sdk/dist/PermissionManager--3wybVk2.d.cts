type PermissionKind = 'camera' | 'microphone' | 'screen';
interface PermissionState {
    camera: PermissionStatus;
    microphone: PermissionStatus;
    screen: PermissionStatus;
}
type PermissionStatus = 'unknown' | 'pending' | 'granted' | 'denied';
interface AcquiredStreams {
    cameraStream: MediaStream | null;
    micStream: MediaStream | null;
    screenStream: MediaStream | null;
    cameraAndMicStream: MediaStream | null;
}
/**
 * Centralized permission + stream acquisition.
 * Camera & mic acquired together (browser shows a single dialog), screen separately.
 * Streams are kept hot until release(); the SDK reuses the same MediaStream for
 * preview, recording, and AI checks to avoid asking for permission twice.
 */
declare class PermissionManager {
    state: PermissionState;
    acquired: AcquiredStreams;
    private listeners;
    onChange(fn: (s: PermissionState) => void): () => boolean;
    private emit;
    queryStored(): Promise<PermissionState>;
    requestCameraAndMic(constraints?: MediaStreamConstraints): Promise<MediaStream>;
    requestScreen(): Promise<MediaStream>;
    release(): void;
}

export { type AcquiredStreams as A, type PermissionKind as P, PermissionManager as a, type PermissionState as b, type PermissionStatus as c };
