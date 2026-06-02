export interface ChatMessage {
  id?: number;
  sender_type?: 'candidate' | 'proctor' | 'system';
  message?: string;
  type?: string;
  created_at?: string;
}

export interface ProctorChatClientOptions {
  wsUrl: string;
  /** ws_token from /sdk/sessions/init OR `bearer` query for proctor */
  token?: string;
  /** Fallback to tenant API key over `x-api-key` query */
  apiKey?: string;
  /** True for tenant-admin proctor connections (uses bearer= query) */
  asProctor?: boolean;
}

/**
 * Slim WebSocket client. Used by candidate (with ws_token) and by tenant-admin
 * proctor live view (with admin JWT) to chat, receive status updates,
 * pause/resume notifications, and proctor commands.
 */
export class ProctorChatClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(msg: Record<string, unknown>) => void>();
  private opened = false;
  private destroyed = false;

  constructor(private readonly opts: ProctorChatClientOptions) {}

  connect() {
    if (this.ws) return;
    const url = new URL(this.opts.wsUrl);
    if (this.opts.asProctor && this.opts.token) {
      url.searchParams.set('bearer', this.opts.token);
    } else if (this.opts.token) {
      url.searchParams.set('token', this.opts.token);
    } else if (this.opts.apiKey) {
      url.searchParams.set('x-api-key', this.opts.apiKey);
    }
    try {
      this.ws = new WebSocket(url.toString());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.opened = true;
      this.emit({ type: 'ws_open' });
    };
    this.ws.onclose = () => {
      this.opened = false;
      this.ws = null;
      this.emit({ type: 'ws_close' });
      if (!this.destroyed) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.emit({ type: 'ws_error' });
    };
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.emit(data);
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.connect();
    }, 3000);
  }

  on(fn: (msg: Record<string, unknown>) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(msg: Record<string, unknown>) {
    this.listeners.forEach((fn) => fn(msg));
  }

  send(payload: Record<string, unknown>) {
    if (!this.ws || !this.opened) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  sendChat(message: string) {
    return this.send({ op: 'chat', message });
  }

  ping() {
    return this.send({ op: 'ping', ts: Date.now() });
  }

  syncTimer() {
    return this.send({ op: 'timer_tick', ts: Date.now() });
  }

  pollStatus() {
    return this.send({ op: 'status_poll' });
  }

  close() {
    this.destroyed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
