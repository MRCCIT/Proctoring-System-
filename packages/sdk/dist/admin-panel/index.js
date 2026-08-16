// src/admin-panel/components/AdminDashboard.tsx
import { jsx } from "react/jsx-runtime";
var LINKS = [
  { href: "/sessions", label: "Sessions" },
  { href: "/exams", label: "Exams" },
  { href: "/candidates", label: "Candidates" },
  { href: "/live", label: "Live monitoring" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" }
];
function AdminDashboard() {
  return /* @__PURE__ */ jsx("nav", { style: { display: "flex", gap: 16, flexWrap: "wrap" }, children: LINKS.map((l) => /* @__PURE__ */ jsx("a", { href: l.href, style: { color: "#0f172a" }, children: l.label }, l.href)) });
}

// src/admin-panel/components/LiveMonitoring.tsx
import { useEffect, useState } from "react";
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function LiveMonitoring(props) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    void props.client.request("GET", "/v1/sessions/live").then((r) => setItems(r.data || []));
  }, [props.client]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx2("h2", { children: "Live sessions" }),
    /* @__PURE__ */ jsx2("pre", { style: { fontSize: 12, overflow: "auto" }, children: JSON.stringify(items, null, 2) })
  ] });
}

// src/admin-panel/components/ProctorLiveView.tsx
import { useCallback, useEffect as useEffect2, useMemo, useRef, useState as useState2 } from "react";

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

// src/media/TURNResolver.ts
var TURNResolver = class {
  constructor(client) {
    this.client = client;
  }
  async resolve() {
    const res = await this.client.getTurnCredentials();
    return res.data;
  }
};

// src/media/LiveVideoSignaling.ts
var LiveVideoSignaling = class _LiveVideoSignaling {
  constructor(role, chat, getLocalStream, onRemoteStream, iceServers) {
    this.role = role;
    this.chat = chat;
    this.getLocalStream = getLocalStream;
    this.onRemoteStream = onRemoteStream;
    this.iceServers = iceServers;
    this.pc = null;
    this.polite = role === "proctor";
  }
  static async create(client, opts) {
    let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    try {
      const turn = await new TURNResolver(client).resolve();
      if (turn?.ice_servers?.length) iceServers = turn.ice_servers;
    } catch {
    }
    return new _LiveVideoSignaling(opts.role, opts.chat, opts.getLocalStream, opts.onRemoteStream, iceServers);
  }
  start() {
    this.offChat = this.chat.on((msg) => void this.onWsMessage(msg));
    if (this.role === "proctor") {
      this.chat.send({ op: "live_watch" });
    }
  }
  stop() {
    this.offChat?.();
    this.offChat = void 0;
    try {
      this.pc?.close();
    } catch {
    }
    this.pc = null;
  }
  sendSignal(signal) {
    this.chat.send({ op: "live_signal", signal });
  }
  async ensurePc() {
    if (this.pc) return this.pc;
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.sendSignal({ type: "ice", candidate: ev.candidate.toJSON() });
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.onRemoteStream?.(stream);
    };
    if (this.role === "candidate") {
      const stream = this.getLocalStream();
      stream?.getTracks().forEach((track) => {
        try {
          this.pc.addTrack(track, stream);
        } catch {
        }
      });
    }
    return this.pc;
  }
  async publishOffer() {
    const pc = await this.ensurePc();
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    this.sendSignal({ type: "offer", sdp: offer.sdp });
  }
  async onWsMessage(msg) {
    const type = msg.type;
    if (type === "live_watch_request" && this.role === "candidate") {
      await this.publishOffer();
      return;
    }
    if (type !== "live_signal") return;
    const from = msg.from;
    if (from === this.role) return;
    const signal = msg.signal;
    if (!signal) return;
    const pc = await this.ensurePc();
    if (signal.type === "offer" && this.role === "proctor") {
      const offerCollision = pc.signalingState !== "stable";
      const ignore = !this.polite && offerCollision;
      if (ignore) return;
      if (offerCollision) {
        await pc.setLocalDescription({ type: "rollback" });
      }
      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({ type: "answer", sdp: answer.sdp });
      return;
    }
    if (signal.type === "answer" && this.role === "candidate") {
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      }
      return;
    }
    if (signal.type === "ice" && signal.candidate) {
      try {
        await pc.addIceCandidate(signal.candidate);
      } catch {
      }
    }
  }
};

// src/admin-panel/components/proctorLiveHelpers.ts
function candidateInitials(name, email) {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || "").trim();
  return e ? e.slice(0, 2).toUpperCase() : "?";
}
function parseViolationCaption(caption) {
  const raw = caption.replace(/^Violation:\s*/i, "").trim();
  const code = raw.split(/\s*[-–·]\s*/)[0]?.trim() || raw;
  const label = code.replace(/^ai_/i, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const lower = code.toLowerCase();
  let severity = "warning";
  if (/tab|window|focus|phone|identity|multiple|absent/.test(lower)) severity = "critical";
  else if (/gaze|looking|sideways|head/.test(lower)) severity = "warning";
  else severity = "info";
  return { label, code, severity };
}
function sessionStatusTone(status) {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "in_progress") return "active";
  if (s === "paused") return "paused";
  if (s === "completed" || s === "terminated" || s === "ended") return "ended";
  return "unknown";
}
function formatMatchScore(score) {
  if (score == null || Number.isNaN(score)) return null;
  const n = Number(score);
  if (n <= 1) return `${Math.round(n * 100)}%`;
  if (n <= 100) return `${Math.round(n)}%`;
  return `${n.toFixed(1)}`;
}

// src/admin-panel/components/ProctorLiveView.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function IconLive() {
  return /* @__PURE__ */ jsx3("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: /* @__PURE__ */ jsx3("circle", { cx: "12", cy: "12", r: "4" }) });
}
function IconVideo() {
  return /* @__PURE__ */ jsxs2("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx3("rect", { x: "2", y: "5", width: "15", height: "14", rx: "2" }),
    /* @__PURE__ */ jsx3("path", { d: "M17 9l5-3v12l-5-3V9z" })
  ] });
}
function ProctorLiveView(props) {
  const { client, bearerToken, sessionId, brandPrimary = "#0f172a" } = props;
  const baseUrl = props.baseUrl || client.options.baseUrl;
  const apiRoot = baseUrl.replace(/\/$/, "");
  const [messages, setMessages] = useState2([]);
  const [draft, setDraft] = useState2("");
  const [face, setFace] = useState2([]);
  const [status, setStatus] = useState2({});
  const [extraSeconds, setExtraSeconds] = useState2(300);
  const [annot, setAnnot] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [err, setErr] = useState2(null);
  const chatRef = useRef(null);
  const liveVideoRef = useRef(null);
  const liveWatchTimerRef = useRef(null);
  const liveConnectedRef = useRef(false);
  const remoteVideoRef = useRef(null);
  const previewRevokeRef = useRef([]);
  const violationRevokeRef = useRef([]);
  const [hdr, setHdr] = useState2({});
  const [previewUrl, setPreviewUrl] = useState2(null);
  const [previewErr, setPreviewErr] = useState2(null);
  const [liveConnected, setLiveConnected] = useState2(false);
  const [violationThumbs, setViolationThumbs] = useState2([]);
  const [lightbox, setLightbox] = useState2(null);
  const [violationFilter, setViolationFilter] = useState2("all");
  const statusTone = sessionStatusTone(status.status);
  const candidateLine = [hdr.candidateName, hdr.candidateEmail].filter(Boolean).join(" \xB7 ");
  const initials = candidateInitials(hdr.candidateName, hdr.candidateEmail);
  const filteredViolations = useMemo(() => {
    if (violationFilter === "all") return violationThumbs;
    return violationThumbs.filter((v) => {
      const { code } = parseViolationCaption(v.caption);
      return code.toLowerCase().includes(violationFilter);
    });
  }, [violationThumbs, violationFilter]);
  const violationCategories = useMemo(() => {
    const cats = /* @__PURE__ */ new Set();
    for (const v of violationThumbs) {
      const { code } = parseViolationCaption(v.caption);
      if (/tab|window|focus/.test(code)) cats.add("focus");
      else if (/gaze|looking|head|sideways/.test(code)) cats.add("gaze");
      else if (/phone|object/.test(code)) cats.add("object");
      else cats.add("other");
    }
    return Array.from(cats);
  }, [violationThumbs]);
  const faceRows = useMemo(() => [...face].reverse().slice(0, 25), [face]);
  const fetchPanelData = useCallback(async () => {
    try {
      const [chat, faces, snaps] = await Promise.all([
        client.listSessionChat(sessionId, 100),
        client.listSessionFaceChecks(sessionId, 40),
        client.getSessionSnapshots(sessionId)
      ]);
      setMessages(chat.data || []);
      setFace(faces.data || []);
      const snapRows = snaps.data || [];
      const loadSnapBlob = async (id) => {
        const res = await fetch(`${apiRoot}/v1/media/snapshots/${id}?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${bearerToken}` }
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return blob.size > 0 ? URL.createObjectURL(blob) : null;
      };
      const latestLive = snapRows.find((s) => s.source === "live_preview" && (s.file_path || s.bytes)) || snapRows.find((s) => s.file_path || s.bytes != null && s.bytes > 0);
      if (latestLive?.id && bearerToken) {
        try {
          const objUrl = await loadSnapBlob(latestLive.id);
          if (objUrl) {
            previewRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
            previewRevokeRef.current = [objUrl];
            setPreviewUrl(objUrl);
            setPreviewErr(null);
          }
        } catch (e) {
          setPreviewErr(e.message);
        }
      }
      const violationRows = snapRows.filter((s) => s.source === "violation" || s.source && s.source !== "live_preview").slice(0, 24);
      if (bearerToken && violationRows.length) {
        const loaded = await Promise.all(
          violationRows.map(async (s) => {
            const url = await loadSnapBlob(s.id);
            if (!url) return null;
            return {
              id: s.id,
              url,
              caption: s.caption || "Violation",
              captured_at: s.captured_at
            };
          })
        );
        violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
        const valid = loaded.filter(Boolean);
        violationRevokeRef.current = valid.map((v) => v.url);
        setViolationThumbs(valid);
      } else {
        violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
        violationRevokeRef.current = [];
        setViolationThumbs([]);
      }
    } catch (e) {
      setErr(e.message);
    }
  }, [client, sessionId, bearerToken, apiRoot]);
  useEffect2(() => {
    void client.getSessionDetail(sessionId).then((r) => {
      const d = r.data;
      const s = d.session || {};
      setHdr({
        exam: s.exam_title || void 0,
        candidateEmail: s.candidate_email || s.external_ref || void 0,
        candidateName: s.candidate_name || void 0
      });
    }).catch(() => {
    });
  }, [client, sessionId]);
  useEffect2(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchPanelData();
    };
    void tick();
    const pol = setInterval(() => void tick(), 5e3);
    return () => {
      cancelled = true;
      clearInterval(pol);
      previewRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
      previewRevokeRef.current = [];
      violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
      violationRevokeRef.current = [];
    };
  }, [fetchPanelData]);
  useEffect2(() => {
    const wsUrl = `${baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}/v1/sdk/ws/sessions/${sessionId}`;
    chatRef.current = new ProctorChatClient({ wsUrl, token: bearerToken, asProctor: true });
    chatRef.current.connect();
    chatRef.current.on((msg) => {
      const t = msg.type;
      if (t === "chat_message") {
        setMessages((prev) => [
          ...prev,
          msg
        ]);
      }
      if (t === "status") setStatus(msg);
      if (t === "ws_open") {
        liveVideoRef.current?.stop();
        void LiveVideoSignaling.create(client, {
          role: "proctor",
          chat: chatRef.current,
          getLocalStream: () => null,
          onRemoteStream: (stream) => {
            liveConnectedRef.current = true;
            setLiveConnected(true);
            if (liveWatchTimerRef.current) {
              clearInterval(liveWatchTimerRef.current);
              liveWatchTimerRef.current = null;
            }
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
              void remoteVideoRef.current.play().catch(() => {
              });
            }
          }
        }).then((sig) => {
          liveVideoRef.current = sig;
          sig.start();
          if (liveWatchTimerRef.current) clearInterval(liveWatchTimerRef.current);
          liveWatchTimerRef.current = setInterval(() => {
            if (!liveConnectedRef.current) chatRef.current?.send({ op: "live_watch" });
          }, 12e3);
        });
      }
    });
    chatRef.current.pollStatus();
    const poll = setInterval(() => chatRef.current?.pollStatus(), 1e4);
    return () => {
      clearInterval(poll);
      if (liveWatchTimerRef.current) clearInterval(liveWatchTimerRef.current);
      liveWatchTimerRef.current = null;
      liveVideoRef.current?.stop();
      liveVideoRef.current = null;
      liveConnectedRef.current = false;
      setLiveConnected(false);
      chatRef.current?.close();
    };
  }, [sessionId, bearerToken, baseUrl, client]);
  const send = async () => {
    const m = draft.trim();
    if (!m) return;
    setDraft("");
    const sent = chatRef.current?.sendChat(m);
    if (!sent) {
      try {
        await client.postSessionChat(sessionId, m);
      } catch (e) {
        setErr(e.message);
      }
    }
  };
  const wrap = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await fetchPanelData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "proctor-root", style: { ["--proctor-brand"]: brandPrimary }, children: [
    lightbox && /* @__PURE__ */ jsx3(
      "div",
      {
        className: "evidence-lightbox",
        role: "dialog",
        "aria-modal": true,
        onClick: () => setLightbox(null),
        onKeyDown: (e) => e.key === "Escape" && setLightbox(null),
        children: /* @__PURE__ */ jsxs2("div", { className: "evidence-lightbox-inner", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsx3("button", { type: "button", className: "evidence-lightbox-close", onClick: () => setLightbox(null), "aria-label": "Close", children: "\xD7" }),
          /* @__PURE__ */ jsx3("img", { src: lightbox.url, alt: "", className: "evidence-lightbox-img" }),
          /* @__PURE__ */ jsxs2("div", { className: "evidence-lightbox-footer", children: [
            lightbox.title,
            lightbox.subtitle ? ` \xB7 ${lightbox.subtitle}` : ""
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsxs2("header", { className: "proctor-header", children: [
      /* @__PURE__ */ jsxs2("div", { className: "proctor-header-main", children: [
        /* @__PURE__ */ jsxs2("nav", { className: "proctor-breadcrumb", "aria-label": "Breadcrumb", children: [
          /* @__PURE__ */ jsx3("span", { className: "proctor-breadcrumb-muted", children: "Live" }),
          /* @__PURE__ */ jsx3("span", { className: "proctor-breadcrumb-sep", children: "/" }),
          /* @__PURE__ */ jsx3("span", { children: hdr.exam || "Exam session" })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "proctor-candidate-row", children: [
          /* @__PURE__ */ jsx3("div", { className: "proctor-avatar", "aria-hidden": true, children: initials }),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("h2", { className: "proctor-candidate-name", children: hdr.candidateName || "Candidate" }),
            candidateLine && /* @__PURE__ */ jsx3("p", { className: "proctor-candidate-meta", children: candidateLine })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "proctor-header-badges", children: [
        /* @__PURE__ */ jsx3("span", { className: `proctor-pill proctor-pill-status proctor-pill-${statusTone}`, children: status.status || "Unknown" }),
        /* @__PURE__ */ jsxs2("span", { className: `proctor-pill proctor-pill-stream ${liveConnected ? "proctor-pill-live" : ""}`, children: [
          /* @__PURE__ */ jsx3(IconLive, {}),
          liveConnected ? "Stream live" : "Connecting stream"
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: "proctor-pill proctor-pill-muted", title: "Session id", children: [
          sessionId.slice(0, 8),
          "\u2026"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "proctor-stats", children: [
      /* @__PURE__ */ jsxs2("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-value", children: violationThumbs.length }),
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-label", children: "Violation captures" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-value", children: face.length }),
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-label", children: "Face checks" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-value", children: messages.length }),
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-label", children: "Chat messages" })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx3("span", { className: `proctor-stat-value ${liveConnected ? "proctor-stat-ok" : "proctor-stat-warn"}`, children: liveConnected ? "On" : "\u2026" }),
        /* @__PURE__ */ jsx3("span", { className: "proctor-stat-label", children: "WebRTC" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "proctor-layout", children: [
      /* @__PURE__ */ jsxs2("main", { className: "proctor-main", children: [
        /* @__PURE__ */ jsxs2("section", { className: "proctor-card proctor-video-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "proctor-card-head", children: [
            /* @__PURE__ */ jsxs2("h3", { className: "proctor-card-title", children: [
              /* @__PURE__ */ jsx3(IconVideo, {}),
              "Live feed"
            ] }),
            liveConnected && /* @__PURE__ */ jsxs2("span", { className: "proctor-live-badge", children: [
              /* @__PURE__ */ jsx3("span", { className: "proctor-live-dot" }),
              "LIVE"
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "proctor-video-stage", children: [
            /* @__PURE__ */ jsx3(
              "video",
              {
                ref: remoteVideoRef,
                autoPlay: true,
                playsInline: true,
                muted: true,
                className: "proctor-video-el"
              }
            ),
            !liveConnected && /* @__PURE__ */ jsxs2("div", { className: "proctor-video-overlay", children: [
              /* @__PURE__ */ jsx3("div", { className: "proctor-video-spinner" }),
              /* @__PURE__ */ jsx3("p", { className: "proctor-video-overlay-title", children: "Connecting to candidate camera" }),
              /* @__PURE__ */ jsx3("p", { className: "proctor-video-overlay-hint", children: "Keep this panel open while the candidate exam is running. WebRTC connects automatically." })
            ] }),
            previewUrl && /* @__PURE__ */ jsxs2(
              "button",
              {
                type: "button",
                className: "proctor-pip",
                title: "Latest backup frame (~10s)",
                onClick: () => setLightbox({
                  url: previewUrl,
                  title: "Backup frame",
                  subtitle: "Polled snapshot"
                }),
                children: [
                  /* @__PURE__ */ jsx3("img", { src: previewUrl, alt: "" }),
                  /* @__PURE__ */ jsx3("span", { children: "Backup" })
                ]
              }
            )
          ] }),
          !previewUrl && previewErr && /* @__PURE__ */ jsx3("p", { className: "proctor-inline-muted", children: previewErr })
        ] }),
        /* @__PURE__ */ jsxs2("section", { className: "proctor-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "proctor-card-head", children: [
            /* @__PURE__ */ jsx3("h3", { className: "proctor-card-title", children: "Violation timeline" }),
            /* @__PURE__ */ jsxs2("span", { className: "proctor-card-meta", children: [
              violationThumbs.length,
              " captures"
            ] })
          ] }),
          violationCategories.length > 1 && /* @__PURE__ */ jsxs2("div", { className: "proctor-filters", children: [
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "all" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("all"),
                children: "All"
              }
            ),
            violationCategories.includes("focus") && /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "focus" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("focus"),
                children: "Tab / focus"
              }
            ),
            violationCategories.includes("gaze") && /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "gaze" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("gaze"),
                children: "Gaze"
              }
            ),
            violationCategories.includes("object") && /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "object" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("object"),
                children: "Objects"
              }
            )
          ] }),
          filteredViolations.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "proctor-empty", children: [
            /* @__PURE__ */ jsx3("p", { children: "No violation snapshots yet." }),
            /* @__PURE__ */ jsx3("p", { className: "proctor-inline-muted", children: "AI and lockdown events (tab switch, gaze, phone, identity) appear here automatically." })
          ] }) : /* @__PURE__ */ jsx3("div", { className: "proctor-violation-grid", children: filteredViolations.map((v) => {
            const parsed = parseViolationCaption(v.caption);
            const time = v.captured_at ? new Date(v.captured_at).toLocaleTimeString() : "";
            return /* @__PURE__ */ jsxs2(
              "button",
              {
                type: "button",
                className: `proctor-violation-card proctor-violation-${parsed.severity}`,
                onClick: () => setLightbox({
                  url: v.url,
                  title: parsed.label,
                  subtitle: time
                }),
                children: [
                  /* @__PURE__ */ jsx3("img", { src: v.url, alt: "", className: "proctor-violation-img" }),
                  /* @__PURE__ */ jsxs2("div", { className: "proctor-violation-body", children: [
                    /* @__PURE__ */ jsx3("span", { className: `proctor-violation-tag proctor-tag-${parsed.severity}`, children: parsed.label }),
                    time && /* @__PURE__ */ jsx3("span", { className: "proctor-violation-time", children: time })
                  ] })
                ]
              },
              v.id
            );
          }) })
        ] }),
        /* @__PURE__ */ jsxs2("section", { className: "proctor-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "proctor-card-head", children: [
            /* @__PURE__ */ jsx3("h3", { className: "proctor-card-title", children: "Face & identity checks" }),
            /* @__PURE__ */ jsx3("span", { className: "proctor-card-meta", children: "Server AI \xB7 refreshed every 5s" })
          ] }),
          faceRows.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "proctor-empty", children: [
            /* @__PURE__ */ jsx3("p", { children: "No face checks recorded yet." }),
            /* @__PURE__ */ jsx3("p", { className: "proctor-inline-muted", children: "Start the candidate exam with API and AI sidecar running." })
          ] }) : /* @__PURE__ */ jsx3("div", { className: "proctor-table-wrap", children: /* @__PURE__ */ jsxs2("table", { className: "proctor-table", children: [
            /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
              /* @__PURE__ */ jsx3("th", { children: "Time" }),
              /* @__PURE__ */ jsx3("th", { children: "Source" }),
              /* @__PURE__ */ jsx3("th", { children: "Faces" }),
              /* @__PURE__ */ jsx3("th", { children: "Match" }),
              /* @__PURE__ */ jsx3("th", { children: "Flags" })
            ] }) }),
            /* @__PURE__ */ jsx3("tbody", { children: faceRows.map((f, i) => {
              const match = formatMatchScore(f.match_score);
              const faceOk = f.face_count === 1;
              return /* @__PURE__ */ jsxs2("tr", { children: [
                /* @__PURE__ */ jsx3("td", { className: "proctor-td-time", children: new Date(f.occurred_at).toLocaleTimeString() }),
                /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("span", { className: "proctor-src-badge", children: f.source || f.detector || "\u2014" }) }),
                /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("span", { className: `proctor-face-count ${faceOk ? "ok" : "bad"}`, children: f.face_count }) }),
                /* @__PURE__ */ jsx3("td", { children: match ? /* @__PURE__ */ jsx3(
                  "span",
                  {
                    className: `proctor-match-pill ${parseFloat(match) >= 62 ? "ok" : "warn"}`,
                    children: match
                  }
                ) : /* @__PURE__ */ jsx3("span", { className: "proctor-inline-muted", children: "\u2014" }) }),
                /* @__PURE__ */ jsx3("td", { className: "proctor-td-flags", children: f.violations?.length ? f.violations.map((x) => /* @__PURE__ */ jsx3("span", { className: "proctor-flag-chip", children: x.replace(/_/g, " ") }, x)) : "\u2014" })
              ] }, i);
            }) })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("aside", { className: "proctor-sidebar", children: [
        /* @__PURE__ */ jsxs2("section", { className: "proctor-card proctor-controls-card", children: [
          /* @__PURE__ */ jsx3("h3", { className: "proctor-card-title", children: "Session controls" }),
          err && /* @__PURE__ */ jsx3("p", { className: "proctor-error", children: err }),
          /* @__PURE__ */ jsxs2("div", { className: "proctor-control-actions", children: [
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-warn",
                disabled: busy,
                onClick: () => void wrap(() => client.pauseSession(sessionId)),
                children: "Pause exam"
              }
            ),
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-success",
                disabled: busy,
                onClick: () => void wrap(() => client.resumeSession(sessionId)),
                children: "Resume"
              }
            ),
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-danger",
                disabled: busy,
                onClick: () => void wrap(() => client.terminateSession(sessionId)),
                children: "Terminate"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "proctor-field", children: [
            /* @__PURE__ */ jsx3("label", { htmlFor: "proctor-extend", children: "Extend time" }),
            /* @__PURE__ */ jsxs2("div", { className: "proctor-field-row", children: [
              /* @__PURE__ */ jsx3(
                "input",
                {
                  id: "proctor-extend",
                  type: "number",
                  min: 30,
                  value: extraSeconds,
                  onChange: (e) => setExtraSeconds(parseInt(e.target.value, 10) || 0)
                }
              ),
              /* @__PURE__ */ jsx3(
                "button",
                {
                  type: "button",
                  className: "proctor-btn proctor-btn-primary",
                  disabled: busy || !extraSeconds,
                  onClick: () => void wrap(() => client.extendSession(sessionId, extraSeconds)),
                  children: "Apply"
                }
              )
            ] }),
            /* @__PURE__ */ jsx3("span", { className: "proctor-field-hint", children: "Seconds added to scheduled end" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "proctor-field", children: [
            /* @__PURE__ */ jsx3("label", { htmlFor: "proctor-note", children: "Proctor note" }),
            /* @__PURE__ */ jsx3(
              "textarea",
              {
                id: "proctor-note",
                value: annot,
                onChange: (e) => setAnnot(e.target.value),
                rows: 3,
                placeholder: "Document an observation for the audit trail\u2026"
              }
            ),
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-primary proctor-btn-block",
                disabled: busy || !annot.trim(),
                onClick: () => void wrap(async () => {
                  await client.annotateSession(sessionId, annot.trim());
                  setAnnot("");
                }),
                children: "Save note"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("section", { className: "proctor-card proctor-chat-card", children: [
          /* @__PURE__ */ jsx3("h3", { className: "proctor-card-title", children: "Candidate chat" }),
          /* @__PURE__ */ jsx3("div", { className: "proctor-chat-log", children: messages.length === 0 ? /* @__PURE__ */ jsx3("p", { className: "proctor-inline-muted", children: "No messages yet. Send a warning or instruction below." }) : messages.map((m, i) => /* @__PURE__ */ jsxs2(
            "div",
            {
              className: `proctor-chat-bubble ${m.sender_type === "proctor" ? "proctor-chat-out" : "proctor-chat-in"}`,
              children: [
                /* @__PURE__ */ jsxs2("div", { className: "proctor-chat-meta", children: [
                  m.sender_type,
                  " \xB7 ",
                  new Date(m.created_at).toLocaleTimeString()
                ] }),
                /* @__PURE__ */ jsx3("div", { children: m.message })
              ]
            },
            i
          )) }),
          /* @__PURE__ */ jsxs2(
            "form",
            {
              className: "proctor-chat-form",
              onSubmit: (e) => {
                e.preventDefault();
                void send();
              },
              children: [
                /* @__PURE__ */ jsx3(
                  "input",
                  {
                    value: draft,
                    onChange: (e) => setDraft(e.target.value),
                    placeholder: "Message candidate\u2026",
                    "aria-label": "Chat message"
                  }
                ),
                /* @__PURE__ */ jsx3("button", { type: "submit", className: "proctor-btn proctor-btn-primary", children: "Send" })
              ]
            }
          )
        ] })
      ] })
    ] })
  ] });
}
export {
  AdminDashboard,
  LiveMonitoring,
  ProctorLiveView
};
//# sourceMappingURL=index.js.map