/**
 * Reliable camera frame capture for AI (analyze / phone / identity) and snapshots.
 * Does not depend on a hidden <video> having videoWidth > 0 — uses ImageCapture,
 * the bound preview element, or a short-lived off-DOM video element.
 */

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function resolveMediaStream(
  stream?: MediaStream | null,
  video?: HTMLVideoElement | null
): MediaStream | null {
  if (stream?.getVideoTracks().some((t) => t.readyState === 'live')) return stream;
  if (video?.srcObject instanceof MediaStream) {
    const s = video.srcObject;
    if (s.getVideoTracks().some((t) => t.readyState === 'live')) return s;
  }
  return stream || (video?.srcObject instanceof MediaStream ? video.srcObject : null);
}

/** Wait until an element can produce frame dimensions (or timeout). */
export function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 6000): Promise<boolean> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('playing', onReady);
      resolve(ok);
    };

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('playing', onReady);

    void video.play().catch(() => {});

    window.setTimeout(() => finish(video.videoWidth > 0 && video.videoHeight > 0), timeoutMs);
  });
}

/** Bind stream to a video element and wait until frames are available. */
export async function bindStreamToVideo(
  stream: MediaStream,
  video: HTMLVideoElement
): Promise<boolean> {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {});
  return waitForVideoReady(video);
}

export type CaptureFrameOptions = {
  maxWidth?: number;
  quality?: number;
};

function drawVideoToJpeg(
  video: HTMLVideoElement,
  quality = 0.82,
  maxWidth = 960
): string | null {
  try {
    if (!video.videoWidth || !video.videoHeight) return null;
    const targetW = Math.min(maxWidth, video.videoWidth);
    const scale = targetW / video.videoWidth;
    const targetH = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

async function captureViaImageCapture(track: MediaStreamTrack): Promise<string | null> {
  const ImageCaptureCtor = (
    window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }
  ).ImageCapture;
  if (!ImageCaptureCtor) return null;
  try {
    const blob = await new ImageCaptureCtor(track).takePhoto();
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function captureViaTempVideo(stream: MediaStream, timeoutMs = 6000): Promise<string | null> {
  const v = document.createElement('video');
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

/** Smaller JPEG for AI monitor-tick (faster upload + inference). */
export async function captureFrameForAi(
  stream?: MediaStream | null,
  existingVideo?: HTMLVideoElement | null
): Promise<string | null> {
  const raw = await captureFrameFromStream(stream, existingVideo, { maxWidth: 480, quality: 0.72 });
  if (!raw) return null;
  return downscaleDataUrl(raw, 360, 0.62);
}

export async function captureFrameFromStream(
  stream?: MediaStream | null,
  existingVideo?: HTMLVideoElement | null,
  opts: CaptureFrameOptions = {}
): Promise<string | null> {
  const maxWidth = opts.maxWidth ?? 960;
  const quality = opts.quality ?? 0.82;
  const resolved = resolveMediaStream(stream, existingVideo);

  if (existingVideo?.videoWidth && existingVideo.videoHeight) {
    const direct = drawVideoToJpeg(existingVideo, quality, maxWidth);
    if (direct) return direct;
  }

  if (resolved) {
    const track = resolved.getVideoTracks().find((t) => t.readyState === 'live');
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
        await existingVideo.play().catch(() => {});
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

function downscaleDataUrl(dataUrl: string, maxWidth: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(maxWidth, img.width);
        const h = Math.round((img.height / img.width) * w) || 1;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Convert a JPEG data-URL into an ImageBitmap for the face-check Web Worker. */
export async function dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    }
  } catch {
    /* fall through */
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        void createImageBitmap(canvas).then(resolve).catch(() => resolve(null));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
