"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/events/index.ts
var events_exports = {};
__export(events_exports, {
  EventEmitter: () => EventEmitter,
  ProctorChatClient: () => ProctorChatClient,
  WebhookDispatcher: () => WebhookDispatcher
});
module.exports = __toCommonJS(events_exports);

// src/events/EventEmitter.ts
var EventEmitter = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
};

// src/events/WebhookDispatcher.ts
var WebhookDispatcher = class {
  constructor(client) {
    this.client = client;
  }
  async dispatchEvents(sessionId, events) {
    return this.client.postSdkEvents({ session_id: sessionId, events });
  }
};

// src/events/ProctorChatClient.ts
var ProctorChatClient = class {
  constructor(opts) {
    this.opts = opts;
    this.ws = null;
    this.reconnectTimer = null;
    this.listeners = /* @__PURE__ */ new Set();
    this.opened = false;
    this.destroyed = false;
  }
  connect() {
    if (this.ws) return;
    const url = new URL(this.opts.wsUrl);
    if (this.opts.asProctor && this.opts.token) {
      url.searchParams.set("bearer", this.opts.token);
    } else if (this.opts.token) {
      url.searchParams.set("token", this.opts.token);
    } else if (this.opts.apiKey) {
      url.searchParams.set("x-api-key", this.opts.apiKey);
    }
    try {
      this.ws = new WebSocket(url.toString());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.opened = true;
      this.emit({ type: "ws_open" });
    };
    this.ws.onclose = () => {
      this.opened = false;
      this.ws = null;
      this.emit({ type: "ws_close" });
      if (!this.destroyed) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.emit({ type: "ws_error" });
    };
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.emit(data);
      } catch {
      }
    };
  }
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.connect();
    }, 3e3);
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(msg) {
    this.listeners.forEach((fn) => fn(msg));
  }
  send(payload) {
    if (!this.ws || !this.opened) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
  sendChat(message) {
    return this.send({ op: "chat", message });
  }
  ping() {
    return this.send({ op: "ping", ts: Date.now() });
  }
  syncTimer() {
    return this.send({ op: "timer_tick", ts: Date.now() });
  }
  pollStatus() {
    return this.send({ op: "status_poll" });
  }
  close() {
    this.destroyed = true;
    try {
      this.ws?.close();
    } catch {
    }
    this.ws = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EventEmitter,
  ProctorChatClient,
  WebhookDispatcher
});
//# sourceMappingURL=index.cjs.map