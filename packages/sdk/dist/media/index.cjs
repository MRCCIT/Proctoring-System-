"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/media/index.ts
var media_exports = {};
__export(media_exports, {
  ChunkedRecorder: () => ChunkedRecorder,
  MediaRecorderWrapper: () => MediaRecorderWrapper,
  PermissionManager: () => PermissionManager,
  TURNResolver: () => TURNResolver,
  WebRTCManager: () => WebRTCManager,
  buildChunkSignaler: () => buildChunkSignaler,
  captureVideoFrame: () => captureVideoFrame
});
module.exports = __toCommonJS(media_exports);

// src/media/TURNResolver.ts
var TURNResolver = class {
  constructor(client) {
    this.client = client;
  }
  async resolve() {
    const res = await this.client.getTurnCredentials();
    return res.data;
  }
};

// src/media/WebRTCManager.ts
var WebRTCManager = class {
  constructor(client) {
    this.client = client;
    this.turn = new TURNResolver(this.client);
  }
  async createPeerConnection() {
    const turn = await this.turn.resolve();
    const iceServers = turn?.ice_servers ?? [{ urls: "stun:stun.l.google.com:19302" }];
    return new RTCPeerConnection({ iceServers });
  }
};

// src/media/MediaRecorder.ts
var MediaRecorderWrapper = class {
  constructor() {
    this.recorder = null;
  }
  start(stream, onChunk) {
    this.recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) onChunk(e.data);
    };
    this.recorder.start(5e3);
  }
  stop() {
    this.recorder?.stop();
    this.recorder = null;
  }
};

// src/media/SnapshotCapture.ts
async function captureVideoFrame(video) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

// src/media/PermissionManager.ts
var PermissionManager = class {
  constructor() {
    this.state = {
      camera: "unknown",
      microphone: "unknown",
      screen: "unknown"
    };
    this.acquired = {
      cameraStream: null,
      micStream: null,
      screenStream: null,
      cameraAndMicStream: null
    };
    this.listeners = /* @__PURE__ */ new Set();
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }
  async queryStored() {
    try {
      const anyNav = navigator;
      if (!anyNav.permissions?.query) return this.state;
      for (const kind of ["camera", "microphone"]) {
        try {
          const r = await anyNav.permissions.query({ name: kind });
          this.state[kind] = r.state;
        } catch {
        }
      }
      this.emit();
    } catch {
    }
    return this.state;
  }
  async requestCameraAndMic(constraints) {
    this.state.camera = "pending";
    this.state.microphone = "pending";
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        constraints ?? {
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true }
        }
      );
      this.acquired.cameraAndMicStream = stream;
      this.acquired.cameraStream = new MediaStream(stream.getVideoTracks());
      this.acquired.micStream = new MediaStream(stream.getAudioTracks());
      this.state.camera = "granted";
      this.state.microphone = "granted";
      this.emit();
      return stream;
    } catch (err) {
      this.state.camera = "denied";
      this.state.microphone = "denied";
      this.emit();
      throw err;
    }
  }
  async requestScreen() {
    this.state.screen = "pending";
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });
      this.acquired.screenStream = stream;
      this.state.screen = "granted";
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          this.state.screen = "denied";
          this.acquired.screenStream = null;
          this.emit();
        };
      });
      this.emit();
      return stream;
    } catch (err) {
      this.state.screen = "denied";
      this.emit();
      throw err;
    }
  }
  release() {
    Object.values(this.acquired).forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    this.acquired = {
      cameraStream: null,
      micStream: null,
      screenStream: null,
      cameraAndMicStream: null
    };
  }
};

// src/media/ChunkedRecorder.ts
var DEFAULT_MIMES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
function pickMime(list) {
  for (const m of list) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return void 0;
}
var ChunkedRecorder = class {
  constructor(opts) {
    this.opts = opts;
    this.recorder = null;
    this.sequence = 0;
    this.currentChunkStart = 0;
    this.buffer = [];
  }
  start(stream) {
    if (this.recorder) return;
    const chunkMs = this.opts.chunkMs ?? 1e4;
    const mime = pickMime(this.opts.mimeTypes ?? DEFAULT_MIMES);
    this.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    this.currentChunkStart = Date.now();
    this.recorder.ondataavailable = async (e) => {
      if (!e.data.size) return;
      this.buffer.push(e.data);
      const endedAt = Date.now();
      const blob = new Blob(this.buffer, { type: this.buffer[0].type });
      const sequence = this.sequence++;
      const startedAt = new Date(this.currentChunkStart).toISOString();
      this.currentChunkStart = endedAt;
      this.buffer = [];
      try {
        await this.opts.onChunk?.({
          blob,
          sequence,
          track: this.opts.track,
          startedAt,
          endedAt: new Date(endedAt).toISOString()
        });
      } catch {
      }
    };
    this.recorder.start(chunkMs);
  }
  stop() {
    try {
      this.recorder?.stop();
    } catch {
    }
    this.recorder = null;
  }
};
function buildChunkSignaler(client, sessionId) {
  return async ({
    blob,
    sequence,
    track,
    startedAt,
    endedAt
  }) => {
    await client.postRecordingChunk(sessionId, {
      track,
      sequence,
      bytes: blob.size,
      duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
      started_at: startedAt,
      ended_at: endedAt,
      metadata: { mime: blob.type }
    });
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ChunkedRecorder,
  MediaRecorderWrapper,
  PermissionManager,
  TURNResolver,
  WebRTCManager,
  buildChunkSignaler,
  captureVideoFrame
});
//# sourceMappingURL=index.cjs.map