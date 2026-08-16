// src/lockdown/KeyboardInterceptor.ts
var BLOCKED = /* @__PURE__ */ new Set(["F12", "c", "v", "a", "p", "s"]);
var KeyboardInterceptor = class {
  constructor() {
    this.handler = null;
  }
  start(onBlocked) {
    this.handler = (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.ctrlKey || e.metaKey) && BLOCKED.has(key)) {
        e.preventDefault();
        onBlocked();
      }
    };
    window.addEventListener("keydown", this.handler, true);
  }
  stop() {
    if (this.handler) window.removeEventListener("keydown", this.handler, true);
    this.handler = null;
  }
};

// src/lockdown/VisibilityMonitor.ts
var VisibilityMonitor = class {
  constructor() {
    this.handler = null;
  }
  start(onChange) {
    this.handler = () => onChange(document.hidden);
    document.addEventListener("visibilitychange", this.handler);
  }
  stop() {
    if (this.handler) document.removeEventListener("visibilitychange", this.handler);
    this.handler = null;
  }
};

// src/lockdown/ScreenCaptureBlocker.ts
var ScreenCaptureBlocker = class {
  attach() {
    if ("getDisplayMedia" in navigator.mediaDevices) {
      const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException("Screen capture disabled during exam", "NotAllowedError");
      };
      return () => {
        navigator.mediaDevices.getDisplayMedia = orig;
      };
    }
    return () => {
    };
  }
};

// src/lockdown/WindowFocusMonitor.ts
var WindowFocusMonitor = class {
  constructor() {
    this.blurHandler = null;
    this.focusHandler = null;
  }
  start(onChange) {
    this.blurHandler = () => onChange(false);
    this.focusHandler = () => onChange(true);
    window.addEventListener("blur", this.blurHandler);
    window.addEventListener("focus", this.focusHandler);
  }
  stop() {
    if (this.blurHandler) window.removeEventListener("blur", this.blurHandler);
    if (this.focusHandler) window.removeEventListener("focus", this.focusHandler);
    this.blurHandler = null;
    this.focusHandler = null;
  }
};

// src/lockdown/LockdownEnforcer.ts
var LockdownEnforcer = class {
  constructor() {
    this.keyboard = new KeyboardInterceptor();
    this.visibility = new VisibilityMonitor();
    this.windowFocus = new WindowFocusMonitor();
    this.capture = new ScreenCaptureBlocker();
    this.releaseCapture = null;
    this.displayCheckTimer = null;
    this.lastMultiDisplay = null;
    this.listeners = [];
    this.onViolation = null;
  }
  start(onViolation, opts = {}) {
    const merged = {
      blockContextMenu: opts.blockContextMenu ?? true,
      blockCopyPaste: opts.blockCopyPaste ?? true,
      blockSelection: opts.blockSelection ?? false,
      blockScreenCapture: opts.blockScreenCapture ?? true,
      forceFullscreen: opts.forceFullscreen ?? false
    };
    this.onViolation = onViolation ?? null;
    this.keyboard.start(() => this.fire("blocked_shortcut"));
    this.visibility.start((hidden) => this.fire(hidden ? "tab_hidden" : "tab_visible"));
    this.windowFocus.start((focused) => this.fire(focused ? "window_focus" : "window_blur"));
    const checkDisplays = () => {
      let multipleDisplays = false;
      try {
        multipleDisplays = Boolean(
          window.screen.isExtended
        );
      } catch {
      }
      if (multipleDisplays !== this.lastMultiDisplay) {
        this.lastMultiDisplay = multipleDisplays;
        this.fire(multipleDisplays ? "multiple_displays_detected" : "single_display_detected");
      }
    };
    checkDisplays();
    this.displayCheckTimer = setInterval(checkDisplays, 3e4);
    if (merged.blockContextMenu) {
      const h = (e) => {
        e.preventDefault();
        this.fire("context_menu");
      };
      window.addEventListener("contextmenu", h, true);
      this.listeners.push(() => window.removeEventListener("contextmenu", h, true));
    }
    if (merged.blockCopyPaste) {
      const blocked = (kind) => (e) => {
        e.preventDefault();
        this.fire(kind);
      };
      const copy = blocked("copy_attempt");
      const paste = blocked("paste_attempt");
      const cut = blocked("cut_attempt");
      document.addEventListener("copy", copy, true);
      document.addEventListener("paste", paste, true);
      document.addEventListener("cut", cut, true);
      this.listeners.push(() => {
        document.removeEventListener("copy", copy, true);
        document.removeEventListener("paste", paste, true);
        document.removeEventListener("cut", cut, true);
      });
    }
    if (merged.blockSelection) {
      const original = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      this.listeners.push(() => {
        document.body.style.userSelect = original;
      });
    }
    const fsChange = () => {
      if (!document.fullscreenElement) this.fire("fullscreen_exit");
    };
    document.addEventListener("fullscreenchange", fsChange);
    this.listeners.push(() => document.removeEventListener("fullscreenchange", fsChange));
    if (merged.blockScreenCapture) {
      this.releaseCapture = this.capture.attach();
    }
    if (merged.forceFullscreen) {
      try {
        document.documentElement.requestFullscreen?.().catch(() => {
        });
      } catch {
      }
    }
  }
  fire(r) {
    this.onViolation?.(r);
  }
  stop() {
    this.keyboard.stop();
    this.visibility.stop();
    this.windowFocus.stop();
    this.releaseCapture?.();
    this.releaseCapture = null;
    if (this.displayCheckTimer) clearInterval(this.displayCheckTimer);
    this.displayCheckTimer = null;
    this.lastMultiDisplay = null;
    while (this.listeners.length) this.listeners.pop()?.();
    this.onViolation = null;
  }
};

// src/lockdown/ExternalAppDetector.ts
var ExternalAppDetector = class {
  async scan() {
    return { suspicious: false, details: [] };
  }
};

// src/lockdown/NetworkMonitor.ts
var NetworkMonitor = class {
  constructor() {
    this.timer = null;
    this.listeners = /* @__PURE__ */ new Set();
    this.lastOnline = navigator.onLine;
  }
  start(intervalMs = 15e3, probeUrl) {
    const handler = (online) => () => {
      this.lastOnline = online;
      this.emit({ online, rtt_ms: null, downlink_mbps: null, effective_type: null, ts: Date.now() });
    };
    const off = handler(false);
    const on = handler(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    this.timer = setInterval(async () => {
      const snap = await this.probe(probeUrl);
      this.emit(snap);
    }, intervalMs);
    void this.probe(probeUrl).then((s) => this.emit(s));
    this._detach = () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(s) {
    this.listeners.forEach((fn) => fn(s));
  }
  async probe(probeUrl) {
    const c = navigator.connection;
    let rtt = c?.rtt ?? null;
    if (probeUrl && (rtt == null || !rtt)) {
      const t = performance.now();
      try {
        await fetch(probeUrl, { method: "HEAD", cache: "no-store" });
        rtt = Math.round(performance.now() - t);
      } catch {
        rtt = null;
      }
    }
    return {
      online: navigator.onLine,
      rtt_ms: rtt,
      downlink_mbps: c?.downlink ?? null,
      effective_type: c?.effectiveType ?? null,
      ts: Date.now()
    };
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._detach?.();
  }
};

// src/lockdown/KeystrokeAnalyzer.ts
var KeystrokeAnalyzer = class {
  constructor() {
    this.times = [];
    this.onAnomaly = null;
    this.kdHandler = null;
    this.pasteHandler = null;
    this.lastReport = 0;
  }
  start(onAnomaly) {
    this.onAnomaly = onAnomaly;
    this.kdHandler = (e) => this.onKey(e);
    this.pasteHandler = (e) => this.onPaste(e);
    window.addEventListener("keydown", this.kdHandler, true);
    window.addEventListener("paste", this.pasteHandler, true);
  }
  onKey(_e) {
    const now = performance.now();
    this.times.push(now);
    if (this.times.length > 60) this.times.shift();
    if (this.times.length >= 30) {
      const intervals = this.times.slice(1).map((t, i) => t - this.times[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avg < 30 && now - this.lastReport > 5e3) {
        this.lastReport = now;
        this.onAnomaly?.({ reason: "high_velocity", details: { avg_ms: Math.round(avg) } });
      }
      if (avg > 3e4 && now - this.lastReport > 3e4) {
        this.lastReport = now;
        this.onAnomaly?.({ reason: "long_pause", details: { avg_ms: Math.round(avg) } });
      }
    }
  }
  onPaste(_e) {
    this.onAnomaly?.({ reason: "paste_burst" });
  }
  stop() {
    if (this.kdHandler) window.removeEventListener("keydown", this.kdHandler, true);
    if (this.pasteHandler) window.removeEventListener("paste", this.pasteHandler, true);
    this.kdHandler = null;
    this.pasteHandler = null;
    this.onAnomaly = null;
  }
};
export {
  ExternalAppDetector,
  KeyboardInterceptor,
  KeystrokeAnalyzer,
  LockdownEnforcer,
  NetworkMonitor,
  ScreenCaptureBlocker,
  VisibilityMonitor,
  WindowFocusMonitor
};
//# sourceMappingURL=index.js.map