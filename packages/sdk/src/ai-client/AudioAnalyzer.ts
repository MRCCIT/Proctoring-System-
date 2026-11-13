export interface AudioReading {
  /** RMS volume 0..1 */
  level: number;
  /** Rough estimate of whether voice band (300-3000Hz) carries energy */
  voice_detected: boolean;
  /** Loudness score 0..1 */
  noise: number;
  ts: number;
}

/**
 * Cheap audio monitor. Uses WebAudio AnalyserNode (built-in, off main JS thread on most engines)
 * to estimate volume and voice-band activity. Reports a reading at the given interval.
 */
export class AudioAnalyzer {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(r: AudioReading) => void>();

  start(stream: MediaStream, intervalMs = 1500) {
    if (this.ctx) return;
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      // Browsers often start AudioContext suspended until resume after a gesture.
      void this.ctx.resume().catch(() => {});
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
      this.timer = setInterval(() => this.tick(), intervalMs);
    } catch {
      /* ignore */
    }
  }

  on(fn: (r: AudioReading) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private tick() {
    if (!this.analyser || !this.ctx) return;
    const bufLen = this.analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < bufLen; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / bufLen) / 255;

    const hzPerBin = this.ctx.sampleRate / 2 / bufLen;
    const voiceLow = Math.floor(300 / hzPerBin);
    const voiceHigh = Math.min(bufLen - 1, Math.floor(3000 / hzPerBin));
    let voiceEnergy = 0;
    for (let i = voiceLow; i < voiceHigh; i++) voiceEnergy += data[i];
    const voiceRatio = voiceEnergy / ((voiceHigh - voiceLow) * 255 || 1);
    const reading: AudioReading = {
      level: rms,
      voice_detected: voiceRatio > 0.22 && rms > 0.06,
      noise: Math.min(1, rms * 1.5),
      ts: Date.now(),
    };
    this.listeners.forEach((fn) => fn(reading));
  }

  /** Legacy alias used by ExamFrame placeholder */
  async analyze(_buffer: ArrayBuffer): Promise<{ voice_detected: boolean; noise: number }> {
    return { voice_detected: false, noise: 0 };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.source = null;
    this.analyser = null;
  }
}
