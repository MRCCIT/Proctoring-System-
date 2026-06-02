/** Best-effort: discourage screen capture APIs in supported browsers */
export class ScreenCaptureBlocker {
  attach() {
    if ('getDisplayMedia' in navigator.mediaDevices) {
      const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException('Screen capture disabled during exam', 'NotAllowedError');
      };
      return () => {
        navigator.mediaDevices.getDisplayMedia = orig;
      };
    }
    return () => {};
  }
}
