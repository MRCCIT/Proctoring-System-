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

// src/media/captureFrame.ts
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function resolveMediaStream(stream, video) {
  if (stream?.getVideoTracks().some((t) => t.readyState === "live")) return stream;
  if (video?.srcObject instanceof MediaStream) {
    const s = video.srcObject;
    if (s.getVideoTracks().some((t) => t.readyState === "live")) return s;
  }
  return stream || (video?.srcObject instanceof MediaStream ? video.srcObject : null);
}
function waitForVideoReady(video, timeoutMs = 6e3) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("playing", onReady);
      resolve(ok);
    };
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("playing", onReady);
    void video.play().catch(() => {
    });
    window.setTimeout(() => finish(video.videoWidth > 0 && video.videoHeight > 0), timeoutMs);
  });
}
function drawVideoToJpeg(video, quality = 0.82, maxWidth = 960) {
  try {
    if (!video.videoWidth || !video.videoHeight) return null;
    const targetW = Math.min(maxWidth, video.videoWidth);
    const scale = targetW / video.videoWidth;
    const targetH = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}
async function captureViaImageCapture(track) {
  const ImageCaptureCtor = window.ImageCapture;
  if (!ImageCaptureCtor) return null;
  try {
    const blob = await new ImageCaptureCtor(track).takePhoto();
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}
async function captureViaTempVideo(stream, timeoutMs = 6e3) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = stream;
  const ready = await waitForVideoReady(v, timeoutMs);
  if (!ready) {
    v.srcObject = null;
    return null;
  }
  const url = drawVideoToJpeg(v);
  v.srcObject = null;
  return url;
}
async function captureFrameFromStream(stream, existingVideo, opts = {}) {
  const maxWidth = opts.maxWidth ?? 960;
  const quality = opts.quality ?? 0.82;
  const resolved = resolveMediaStream(stream, existingVideo);
  if (existingVideo?.videoWidth && existingVideo.videoHeight) {
    const direct = drawVideoToJpeg(existingVideo, quality, maxWidth);
    if (direct) return direct;
  }
  if (resolved) {
    const track = resolved.getVideoTracks().find((t) => t.readyState === "live");
    if (track) {
      const fromCapture = await captureViaImageCapture(track);
      if (fromCapture) {
        if (maxWidth < 960) return downscaleDataUrl(fromCapture, maxWidth, quality);
        return fromCapture;
      }
    }
    if (existingVideo) {
      if (existingVideo.srcObject !== resolved) {
        existingVideo.srcObject = resolved;
        await existingVideo.play().catch(() => {
        });
      }
      const ready = await waitForVideoReady(existingVideo);
      if (ready) {
        const fromBound = drawVideoToJpeg(existingVideo, quality, maxWidth);
        if (fromBound) return fromBound;
      }
    }
    const fromTemp = await captureViaTempVideo(resolved);
    if (fromTemp && maxWidth < 960) {
      return downscaleDataUrl(fromTemp, maxWidth, quality);
    }
    return fromTemp;
  }
  if (existingVideo) {
    const ready = await waitForVideoReady(existingVideo);
    if (ready) return drawVideoToJpeg(existingVideo, quality, maxWidth);
  }
  return null;
}
function downscaleDataUrl(dataUrl, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(maxWidth, img.width);
        const h = Math.round(img.height / img.width * w) || 1;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// src/media/SnapshotCapture.ts
async function captureVideoFrame(video) {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  const frame = await captureFrameFromStream(stream, video);
  if (frame) return frame;
  throw new Error("Could not capture a frame from the camera");
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
var DEFAULT_MIMES = ["video/webm;codecs=vp8,opus", "video/webm", "video/webm;codecs=vp9,opus", "video/mp4"];
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
    this.mimeType = "video/webm";
    this.stopResolve = null;
  }
  start(stream) {
    if (this.recorder) return;
    const chunkMs = this.opts.chunkMs ?? 1e4;
    const mime = pickMime(this.opts.mimeTypes ?? DEFAULT_MIMES);
    this.mimeType = mime || "video/webm";
    this.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    this.currentChunkStart = Date.now();
    this.recorder.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const endedAt = Date.now();
      const blob = new Blob([e.data], { type: e.data.type || this.mimeType });
      const sequence = this.sequence++;
      const startedAt = new Date(this.currentChunkStart).toISOString();
      this.currentChunkStart = endedAt;
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
    this.recorder.onstop = () => {
      this.recorder = null;
      const done = this.stopResolve;
      this.stopResolve = null;
      done?.();
    };
    this.recorder.start(chunkMs);
  }
  /** Flush the final timeslice and wait for upload before session teardown. */
  stop() {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") {
      this.recorder = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.stopResolve = null;
        resolve();
      }, 8e3);
      this.stopResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
      try {
        if (rec.state === "recording") rec.requestData();
        rec.stop();
      } catch {
        clearTimeout(timeout);
        this.recorder = null;
        this.stopResolve = null;
        resolve();
      }
    });
  }
};
async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}
function buildChunkSignaler(client, sessionId, opts = {}) {
  const maxBytes = opts.maxBytes ?? 12 * 1024 * 1024;
  return async ({
    blob,
    sequence,
    track,
    startedAt,
    endedAt
  }) => {
    const sendBinary = !opts.metadataOnly && blob.size > 0 && blob.size <= maxBytes;
    const payload_base64 = sendBinary ? await blobToBase64(blob) : void 0;
    await client.postRecordingChunk(sessionId, {
      track,
      sequence,
      bytes: blob.size,
      duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
      started_at: startedAt,
      ended_at: endedAt,
      mime_type: blob.type || "video/webm",
      metadata: { mime: blob.type, persisted: sendBinary },
      payload_base64
    });
  };
}
export {
  ChunkedRecorder,
  MediaRecorderWrapper,
  PermissionManager,
  TURNResolver,
  WebRTCManager,
  buildChunkSignaler,
  captureVideoFrame
};
//# sourceMappingURL=index.js.map