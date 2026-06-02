export type PermissionKind = 'camera' | 'microphone' | 'screen';

export interface PermissionState {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  screen: PermissionStatus;
}

export type PermissionStatus = 'unknown' | 'pending' | 'granted' | 'denied';

export interface AcquiredStreams {
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
export class PermissionManager {
  state: PermissionState = {
    camera: 'unknown',
    microphone: 'unknown',
    screen: 'unknown',
  };
  acquired: AcquiredStreams = {
    cameraStream: null,
    micStream: null,
    screenStream: null,
    cameraAndMicStream: null,
  };

  private listeners = new Set<(s: PermissionState) => void>();

  onChange(fn: (s: PermissionState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }

  async queryStored() {
    try {
      const anyNav = navigator as Navigator & { permissions?: { query: (q: { name: string }) => Promise<PermissionStatus> } };
      if (!anyNav.permissions?.query) return this.state;
      for (const kind of ['camera', 'microphone'] as const) {
        try {
          const r = await anyNav.permissions.query({ name: kind as unknown as PermissionName });
          this.state[kind] = (r as unknown as { state: PermissionStatus }).state as PermissionStatus;
        } catch {
          /* ignore browsers without this permission name */
        }
      }
      this.emit();
    } catch {
      /* ignore */
    }
    return this.state;
  }

  async requestCameraAndMic(constraints?: MediaStreamConstraints): Promise<MediaStream> {
    this.state.camera = 'pending';
    this.state.microphone = 'pending';
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        constraints ?? {
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        }
      );
      this.acquired.cameraAndMicStream = stream;
      this.acquired.cameraStream = new MediaStream(stream.getVideoTracks());
      this.acquired.micStream = new MediaStream(stream.getAudioTracks());
      this.state.camera = 'granted';
      this.state.microphone = 'granted';
      this.emit();
      return stream;
    } catch (err) {
      this.state.camera = 'denied';
      this.state.microphone = 'denied';
      this.emit();
      throw err;
    }
  }

  async requestScreen(): Promise<MediaStream> {
    this.state.screen = 'pending';
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      this.acquired.screenStream = stream;
      this.state.screen = 'granted';
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          this.state.screen = 'denied';
          this.acquired.screenStream = null;
          this.emit();
        };
      });
      this.emit();
      return stream;
    } catch (err) {
      this.state.screen = 'denied';
      this.emit();
      throw err;
    }
  }

  release() {
    Object.values(this.acquired).forEach((s) => s?.getTracks().forEach((t: MediaStreamTrack) => t.stop()));
    this.acquired = {
      cameraStream: null,
      micStream: null,
      screenStream: null,
      cameraAndMicStream: null,
    };
  }
}
