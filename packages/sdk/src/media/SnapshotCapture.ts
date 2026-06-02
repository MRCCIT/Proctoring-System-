import { captureFrameFromStream } from './captureFrame';

export async function captureVideoFrame(video: HTMLVideoElement): Promise<string> {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  const frame = await captureFrameFromStream(stream, video);
  if (frame) return frame;
  throw new Error('Could not capture a frame from the camera');
}
