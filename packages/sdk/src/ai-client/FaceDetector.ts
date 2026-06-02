/**
 * Thin wrapper around the (browser-native, Chrome) FaceDetector. Returns a
 * normalized result so callers can swap to an alternative model without
 * coupling. For server-side ArcFace verification, use the cloud client.
 */
export class FaceDetector {
  private detector: unknown = null;
  private kind: 'native' | 'unavailable' = 'unavailable';

  init() {
    try {
      const Native = (window as unknown as { FaceDetector?: new (opts: unknown) => unknown }).FaceDetector;
      if (Native) {
        this.detector = new Native({ fastMode: true, maxDetectedFaces: 5 });
        this.kind = 'native';
      }
    } catch {
      /* ignore */
    }
  }

  async detect(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<{ faceCount: number; detector: string }> {
    if (!this.detector) this.init();
    if (this.kind === 'native' && this.detector) {
      try {
        const det = this.detector as { detect: (s: unknown) => Promise<unknown[]> };
        const r = await det.detect(source);
        return { faceCount: r.length, detector: 'native_FaceDetector' };
      } catch {
        return { faceCount: 0, detector: 'native_error' };
      }
    }
    return { faceCount: 0, detector: 'unavailable' };
  }

  async detectFromDataUrl(imageDataUrl: string): Promise<{ faceCount: number }> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = imageDataUrl;
    });
    const r = await this.detect(img);
    return { faceCount: r.faceCount };
  }
}
