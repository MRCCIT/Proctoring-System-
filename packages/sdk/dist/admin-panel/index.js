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
import { useEffect as useEffect2, useRef, useState as useState2 } from "react";

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

// src/admin-panel/components/ProctorLiveView.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function ProctorLiveView(props) {
  const { client, bearerToken, sessionId, brandPrimary = "#0f172a" } = props;
  const baseUrl = props.baseUrl || client.options.baseUrl;
  const [messages, setMessages] = useState2([]);
  const [draft, setDraft] = useState2("");
  const [face, setFace] = useState2([]);
  const [status, setStatus] = useState2({});
  const [extraSeconds, setExtraSeconds] = useState2(300);
  const [annot, setAnnot] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [err, setErr] = useState2(null);
  const chatRef = useRef(null);
  const refresh = async () => {
    try {
      const [chat, faces] = await Promise.all([
        client.listSessionChat(sessionId, 100),
        client.listSessionFaceChecks(sessionId, 30)
      ]);
      setMessages(chat.data || []);
      setFace(faces.data || []);
    } catch (e) {
      setErr(e.message);
    }
  };
  useEffect2(() => {
    void refresh();
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
      if (t === "status") {
        setStatus(msg);
      }
    });
    chatRef.current.pollStatus();
    const poll = setInterval(() => chatRef.current?.pollStatus(), 1e4);
    return () => {
      clearInterval(poll);
      chatRef.current?.close();
    };
  }, [sessionId, bearerToken, baseUrl]);
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
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs2("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }, children: [
    /* @__PURE__ */ jsxs2("section", { style: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }, children: [
      /* @__PURE__ */ jsx3("h2", { style: { marginTop: 0, color: brandPrimary }, children: "Live proctor" }),
      /* @__PURE__ */ jsxs2("p", { style: { color: "#475569", fontSize: 13 }, children: [
        "Session ",
        /* @__PURE__ */ jsxs2("code", { children: [
          sessionId.slice(0, 8),
          "\u2026"
        ] }),
        " \xB7 status",
        " ",
        /* @__PURE__ */ jsx3("strong", { children: status.status || "unknown" }),
        status.paused_at ? " (paused)" : ""
      ] }),
      props.snapshotUrl && /* @__PURE__ */ jsx3("img", { src: props.snapshotUrl, alt: "Latest", style: { width: "100%", borderRadius: 8, marginBottom: 12 } }),
      /* @__PURE__ */ jsx3("h3", { style: { fontSize: 14, marginBottom: 6 }, children: "Recent face checks (every 10s)" }),
      /* @__PURE__ */ jsx3("div", { style: { maxHeight: 200, overflowY: "auto", fontSize: 12, fontFamily: "monospace" }, children: face.length === 0 ? /* @__PURE__ */ jsx3("p", { style: { color: "#94a3b8" }, children: "No checks yet." }) : /* @__PURE__ */ jsxs2("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx3("th", { style: { textAlign: "left", borderBottom: "1px solid #e2e8f0" }, children: "Time" }),
          /* @__PURE__ */ jsx3("th", { style: { textAlign: "left", borderBottom: "1px solid #e2e8f0" }, children: "Faces" }),
          /* @__PURE__ */ jsx3("th", { style: { textAlign: "left", borderBottom: "1px solid #e2e8f0" }, children: "Violations" })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: face.slice().reverse().map((f, i) => /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx3("td", { children: new Date(f.occurred_at).toLocaleTimeString() }),
          /* @__PURE__ */ jsx3("td", { style: { color: f.face_count === 1 ? "#16a34a" : "#b91c1c" }, children: f.face_count }),
          /* @__PURE__ */ jsx3("td", { children: f.violations?.join(", ") || "\u2014" })
        ] }, i)) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs2("section", { style: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsx3("h3", { style: { marginTop: 0, color: brandPrimary }, children: "Controls" }),
      err && /* @__PURE__ */ jsx3("p", { style: { color: "#b91c1c", fontSize: 12 }, children: err }),
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }, children: [
        /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => void wrap(() => client.pauseSession(sessionId)),
            style: { background: "#d97706", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
            children: "Pause"
          }
        ),
        /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => void wrap(() => client.resumeSession(sessionId)),
            style: { background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
            children: "Resume"
          }
        ),
        /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => void wrap(() => client.terminateSession(sessionId)),
            style: { background: "#b91c1c", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" },
            children: "Terminate"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsx3("label", { style: { display: "block", fontSize: 12, color: "#475569" }, children: "Extend time (seconds)" }),
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6 }, children: [
          /* @__PURE__ */ jsx3(
            "input",
            {
              type: "number",
              min: 30,
              value: extraSeconds,
              onChange: (e) => setExtraSeconds(parseInt(e.target.value, 10) || 0),
              style: { flex: 1, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 6 }
            }
          ),
          /* @__PURE__ */ jsx3(
            "button",
            {
              type: "button",
              disabled: busy || !extraSeconds,
              onClick: () => void wrap(() => client.extendSession(sessionId, extraSeconds)),
              style: { background: brandPrimary, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" },
              children: "Extend"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 12 }, children: [
        /* @__PURE__ */ jsx3("label", { style: { display: "block", fontSize: 12, color: "#475569" }, children: "Proctor note" }),
        /* @__PURE__ */ jsx3(
          "textarea",
          {
            value: annot,
            onChange: (e) => setAnnot(e.target.value),
            rows: 2,
            style: { width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: 6 }
          }
        ),
        /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            disabled: busy || !annot.trim(),
            onClick: () => void wrap(async () => {
              await client.annotateSession(sessionId, annot.trim());
              setAnnot("");
            }),
            style: { marginTop: 4, background: brandPrimary, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" },
            children: "Save note"
          }
        )
      ] }),
      /* @__PURE__ */ jsx3("h3", { style: { marginTop: 0, marginBottom: 6, color: brandPrimary, fontSize: 14 }, children: "Chat" }),
      /* @__PURE__ */ jsx3("div", { style: { flex: 1, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, fontSize: 13, minHeight: 200 }, children: messages.length === 0 ? /* @__PURE__ */ jsx3("p", { style: { color: "#94a3b8", margin: 0 }, children: "No messages yet." }) : messages.map((m, i) => /* @__PURE__ */ jsxs2("div", { style: { marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs2("div", { style: { color: "#64748b", fontSize: 11 }, children: [
          m.sender_type,
          " \xB7 ",
          new Date(m.created_at).toLocaleTimeString()
        ] }),
        /* @__PURE__ */ jsx3("div", { children: m.message })
      ] }, i)) }),
      /* @__PURE__ */ jsxs2(
        "form",
        {
          onSubmit: (e) => {
            e.preventDefault();
            void send();
          },
          style: { display: "flex", marginTop: 6 },
          children: [
            /* @__PURE__ */ jsx3(
              "input",
              {
                value: draft,
                onChange: (e) => setDraft(e.target.value),
                placeholder: "Message candidate\u2026",
                style: { flex: 1, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }
              }
            ),
            /* @__PURE__ */ jsx3(
              "button",
              {
                type: "submit",
                style: { marginLeft: 6, background: brandPrimary, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" },
                children: "Send"
              }
            )
          ]
        }
      )
    ] })
  ] });
}
export {
  AdminDashboard,
  LiveMonitoring,
  ProctorLiveView
};
//# sourceMappingURL=index.js.map