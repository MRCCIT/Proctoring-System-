export class MediaRecorderWrapper {
  private recorder: MediaRecorder | null = null;

  start(stream: MediaStream, onChunk: (blob: Blob) => void) {
    this.recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) onChunk(e.data);
    };
    this.recorder.start(5000);
  }

  stop() {
    this.recorder?.stop();
    this.recorder = null;
  }
}
