export class WindowFocusMonitor {
  private blurHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;

  start(onChange: (focused: boolean) => void) {
    this.blurHandler = () => onChange(false);
    this.focusHandler = () => onChange(true);
    window.addEventListener('blur', this.blurHandler);
    window.addEventListener('focus', this.focusHandler);
  }

  stop() {
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);
    if (this.focusHandler) window.removeEventListener('focus', this.focusHandler);
    this.blurHandler = null;
    this.focusHandler = null;
  }
}
