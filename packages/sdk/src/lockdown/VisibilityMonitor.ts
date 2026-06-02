export class VisibilityMonitor {
  private handler: (() => void) | null = null;

  start(onChange: (hidden: boolean) => void) {
    this.handler = () => onChange(document.hidden);
    document.addEventListener('visibilitychange', this.handler);
  }

  stop() {
    if (this.handler) document.removeEventListener('visibilitychange', this.handler);
    this.handler = null;
  }
}
