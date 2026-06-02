type Listener = (payload: unknown) => void;

export class EventEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.off(event, fn);
  }

  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
  }

  emit(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
}
