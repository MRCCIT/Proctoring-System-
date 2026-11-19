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

/** Preferred capture for dual-storage pipeline (soft ideals — device may deliver less). */
export const PREFERRED_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 854 },
    height: { ideal: 480 },
    frameRate: { ideal: 15, max: 15 },
    facingMode: 'user',
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: { ideal: 1 },
  },
};

export const PREFERRED_SCREEN_CONSTRAINTS: DisplayMediaStreamOptions = {
  video: {
    width: { ideal: 854 },
    height: { ideal: 480 },
    frameRate: { ideal: 15, max: 15 },
  } as MediaTrackConstraints,
  audio: false,
};

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

  /** Actual settings applied by the device after getUserMedia (for chunk metadata). */
  lastVideoSettings: MediaTrackSettings | null = null;
  lastAudioSettings: MediaTrackSettings | null = null;

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
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints ?? PREFERRED_CAMERA_CONSTRAINTS);
      } catch {
        // Soft-fail: retry without strict frameRate/size ideals
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
      this.acquired.cameraAndMicStream = stream;
      this.acquired.cameraStream = new MediaStream(stream.getVideoTracks());
      this.acquired.micStream = new MediaStream(stream.getAudioTracks());
      this.lastVideoSettings = stream.getVideoTracks()[0]?.getSettings?.() || null;
      this.lastAudioSettings = stream.getAudioTracks()[0]?.getSettings?.() || null;
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
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(PREFERRED_SCREEN_CONSTRAINTS);
      } catch {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 5 },
          audio: false,
        });
      }
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
    this.lastVideoSettings = null;
    this.lastAudioSettings = null;
  }
}
