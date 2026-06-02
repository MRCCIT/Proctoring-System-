import { query } from '../../config/database.js';

/** @type {Map<string, Set<{ ws: import('ws').WebSocket, role: string, send: (payload: object) => void }>>} */
const sessionPeers = new Map();

export function registerSessionPeer(sessionId, peer) {
  if (!sessionPeers.has(sessionId)) sessionPeers.set(sessionId, new Set());
  sessionPeers.get(sessionId).add(peer);
  return () => {
    sessionPeers.get(sessionId)?.delete(peer);
    if (sessionPeers.get(sessionId)?.size === 0) sessionPeers.delete(sessionId);
  };
}

/** @deprecated use registerSessionPeer */
export function registerBroadcaster(sessionId, fn) {
  const peer = { ws: null, role: 'unknown', send: fn };
  return registerSessionPeer(sessionId, peer);
}

export function broadcastToSession(sessionId, payload, exceptWs = null) {
  const set = sessionPeers.get(sessionId);
  if (!set) return 0;
  let count = 0;
  for (const peer of set) {
    if (exceptWs && peer.ws === exceptWs) continue;
    try {
      peer.send(payload);
      count += 1;
    } catch {
      /* ignore broken client */
    }
  }
  return count;
}

export function broadcastChat(sessionId, payload) {
  return broadcastToSession(sessionId, payload);
}

export async function listSessionChatMessages(tenantId, sessionId, { limit }) {
  const n = Math.min(parseInt(limit, 10) || 100, 500);
  const { rows } = await query(
    `SELECT id, sender_type, sender_user_id, message, metadata, created_at
       FROM proctor_chat_messages
      WHERE tenant_id = $1 AND session_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [tenantId, sessionId, n]
  );
  return rows.reverse();
}

export async function postProctorChatMessage(tenantId, sessionId, body, actor) {
  const message = String(body.message || '').trim();
  if (!message) {
    const e = new Error('message is required');
    e.status = 422;
    throw e;
  }
  const sender_type = actor?.type === 'tenant_user' ? 'proctor' : 'system';
  const sender_user_id = actor?.type === 'tenant_user' ? actor.id : null;
  const metadata = {
    sender_email: actor?.email || null,
    sent_via: 'tenant_api',
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
  };
  const { rows } = await query(
    `INSERT INTO proctor_chat_messages (tenant_id, session_id, sender_type, sender_user_id, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, sender_type, sender_user_id, message, metadata, created_at`,
    [tenantId, sessionId, sender_type, sender_user_id, message, JSON.stringify(metadata)]
  );
  const row = rows[0];
  broadcastChat(sessionId, { type: 'chat_message', ...row });
  return row;
}

export async function postCandidateChatMessage(tenantId, sessionId, body) {
  const message = String(body.message || '').trim();
  if (!message) {
    const e = new Error('message is required');
    e.status = 422;
    throw e;
  }
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const { rows } = await query(
    `INSERT INTO proctor_chat_messages (tenant_id, session_id, sender_type, sender_user_id, message, metadata)
     VALUES ($1, $2, 'candidate', NULL, $3, $4::jsonb)
     RETURNING id, sender_type, sender_user_id, message, metadata, created_at`,
    [tenantId, sessionId, message, JSON.stringify(metadata)]
  );
  const row = rows[0];
  broadcastChat(sessionId, { type: 'chat_message', ...row });
  return row;
}
