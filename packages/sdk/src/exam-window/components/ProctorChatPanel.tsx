'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProctorChatClient, ChatMessage } from '../../events/ProctorChatClient';
import type { ProctorShieldClient } from '../../core/ProctorShieldClient';

export interface ProctorChatPanelProps {
  client: ProctorShieldClient;
  sessionId: string;
  chatWs: ProctorChatClient | null;
  brandPrimary?: string;
  collapsed?: boolean;
  onCollapseChange?: (c: boolean) => void;
  /** 'candidate' (default, uses /v1/sdk/...) or 'proctor' (uses /v1/sessions/.../chat) */
  role?: 'candidate' | 'proctor';
}

function messageKey(m: ChatMessage) {
  if (m.id != null) return `id:${m.id}`;
  return `t:${m.sender_type || ''}|${m.message || ''}|${m.created_at || ''}`;
}

/** Merge WS/HTTP echo with an optimistic local bubble so each send appears once. */
function upsertChatMessage(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (incoming.id != null && prev.some((p) => p.id === incoming.id)) return prev;

  const text = (incoming.message || '').trim();
  const sender = incoming.sender_type;
  if (text && sender) {
    // Replace newest optimistic twin (no server id) with the real row.
    for (let i = prev.length - 1; i >= 0; i--) {
      const p = prev[i];
      if (p.id == null && p.sender_type === sender && (p.message || '').trim() === text) {
        const next = prev.slice();
        next[i] = incoming;
        return next;
      }
    }
  }
  return [...prev, incoming];
}

export function ProctorChatPanel(props: ProctorChatPanelProps) {
  const { client, sessionId, chatWs, brandPrimary = '#0f172a', collapsed = false, onCollapseChange, role = 'candidate' } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = role === 'candidate'
          ? await client.listCandidateChat(sessionId, 100)
          : await client.listSessionChat(sessionId, 100);
        setMessages((r.data as ChatMessage[]) || []);
      } catch {
        /* ignore */
      }
    })();
  }, [client, sessionId, role]);

  useEffect(() => {
    if (!chatWs) return;
    const off = chatWs.on((msg) => {
      const t = (msg as { type?: string }).type;
      if (t === 'chat_message') {
        const m = msg as unknown as ChatMessage;
        setMessages((prev) => upsertChatMessage(prev, m));
        // Candidate: auto-open chat on every proctor message.
        // Proctor live view: auto-open when the candidate replies.
        const fromOther =
          (role === 'candidate' && m.sender_type === 'proctor') ||
          (role === 'proctor' && m.sender_type === 'candidate');
        if (fromOther) {
          onCollapseChange?.(false);
          setUnread(0);
        } else if (collapsed) {
          setUnread((u) => u + 1);
        }
      } else if (
        t === 'session_paused' ||
        t === 'session_resumed' ||
        t === 'session_terminated' ||
        t === 'session_extended'
      ) {
        const m = msg as unknown as { type: string; message?: string };
        setMessages((prev) =>
          upsertChatMessage(prev, {
            sender_type: 'system',
            message: m.message || m.type,
            created_at: new Date().toISOString(),
          })
        );
        if (collapsed) setUnread((u) => u + 1);
      }
    });
    return () => {
      off();
    };
  }, [chatWs, collapsed, onCollapseChange, role]);

  useEffect(() => {
    if (!collapsed) setUnread(0);
  }, [collapsed]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const m = draft.trim();
    if (!m) return;
    setDraft('');
    // Optimistic bubble — WS/HTTP echo replaces it via upsert (no double render).
    setMessages((prev) => [
      ...prev,
      {
        sender_type: role === 'candidate' ? 'candidate' : 'proctor',
        message: m,
        created_at: new Date().toISOString(),
      },
    ]);
    const viaWs = chatWs?.sendChat(m);
    if (!viaWs) {
      try {
        if (role === 'candidate') await client.postCandidateChat(sessionId, m);
        else await client.postSessionChat(sessionId, m);
      } catch {
        /* ignore */
      }
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapseChange?.(false)}
        aria-label={unread > 0 ? `Proctor chat, ${unread} unread` : 'Open proctor chat'}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 2147483646,
          background: brandPrimary,
          color: '#fff',
          padding: '12px 16px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          boxShadow: unread > 0 ? '0 0 0 4px rgba(220,38,38,0.35), 0 8px 20px rgba(0,0,0,0.25)' : '0 6px 16px rgba(0,0,0,0.2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 600,
          animation: unread > 0 ? 'ps-chat-pulse 1.2s ease-in-out infinite' : undefined,
        }}
      >
        <style>{`@keyframes ps-chat-pulse { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.06);} }`}</style>
        <span aria-hidden style={{ display: 'inline-flex', width: 16, height: 16 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
            <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          </svg>
        </span>
        Chat
        {unread > 0 ? (
          <span
            style={{
              background: '#dc2626',
              color: '#fff',
              borderRadius: 999,
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <aside
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 320,
        height: 420,
        zIndex: 2147483646,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 24px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui',
      }}
    >
      <header
        style={{
          background: brandPrimary,
          color: '#fff',
          padding: '10px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <strong>Proctor chat</strong>
        <button
          type="button"
          onClick={() => onCollapseChange?.(true)}
          style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18 }}
          aria-label="Minimize chat"
        >
          —
        </button>
      </header>
      <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 13 }}>
        {messages.length === 0 ? (
          <p style={{ color: '#64748b' }}>No messages yet. Your proctor can message you here.</p>
        ) : (
          messages.map((m, i) => (
            <div key={messageKey(m) + ':' + i} style={{ marginBottom: 8 }}>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                {m.sender_type === 'system' ? 'System' : m.sender_type === 'proctor' ? 'Proctor' : 'You'}
              </div>
              <div
                style={{
                  background: m.sender_type === (role === 'candidate' ? 'candidate' : 'proctor') ? brandPrimary : '#f1f5f9',
                  color: m.sender_type === (role === 'candidate' ? 'candidate' : 'proctor') ? '#fff' : '#0f172a',
                  padding: '6px 10px',
                  borderRadius: 8,
                  display: 'inline-block',
                  maxWidth: '90%',
                }}
              >
                {m.message}
              </div>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{ display: 'flex', padding: 8, borderTop: '1px solid #e2e8f0' }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', fontSize: 13 }}
        />
        <button
          type="submit"
          style={{ marginLeft: 8, background: brandPrimary, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
