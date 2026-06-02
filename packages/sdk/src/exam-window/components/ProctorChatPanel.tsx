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
      if ((msg as { type?: string }).type === 'chat_message') {
        const m = msg as unknown as ChatMessage;
        setMessages((prev) => [...prev, m]);
        if (collapsed) setUnread((u) => u + 1);
      } else if ((msg as { type?: string }).type === 'session_paused' ||
        (msg as { type?: string }).type === 'session_resumed' ||
        (msg as { type?: string }).type === 'session_terminated' ||
        (msg as { type?: string }).type === 'session_extended') {
        const m = msg as unknown as { type: string; message?: string };
        setMessages((prev) => [...prev, {
          sender_type: 'system',
          message: m.message || m.type,
          created_at: new Date().toISOString(),
        }]);
        if (collapsed) setUnread((u) => u + 1);
      }
    });
    return () => {
      off();
    };
  }, [chatWs, collapsed]);

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
    setMessages((prev) => [...prev, { sender_type: role === 'candidate' ? 'candidate' : 'proctor', message: m, created_at: new Date().toISOString() }]);
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
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 2147483646,
          background: brandPrimary,
          color: '#fff',
          padding: '10px 16px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
        }}
      >
        Chat{unread > 0 ? ` (${unread})` : ''}
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
            <div key={i} style={{ marginBottom: 8 }}>
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
