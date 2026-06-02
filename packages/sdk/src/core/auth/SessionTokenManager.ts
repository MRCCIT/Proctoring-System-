export class SessionTokenManager {
  constructor(private readonly storageKey: string) {}
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.storageKey);
  }
  set(token: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.storageKey, token);
  }
  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.storageKey);
  }
}
