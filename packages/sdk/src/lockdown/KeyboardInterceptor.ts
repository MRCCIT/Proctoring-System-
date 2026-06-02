const BLOCKED = new Set(['F12', 'c', 'v', 'a', 'p', 's']);

export class KeyboardInterceptor {
  private handler: ((e: KeyboardEvent) => void) | null = null;

  start(onBlocked: () => void) {
    this.handler = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.ctrlKey || e.metaKey) && BLOCKED.has(key)) {
        e.preventDefault();
        onBlocked();
      }
    };
    window.addEventListener('keydown', this.handler, true);
  }

  stop() {
    if (this.handler) window.removeEventListener('keydown', this.handler, true);
    this.handler = null;
  }
}
