import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { verifySdkWsToken, verifyTenantAdminToken } from '../utils/jwt.js';
import { findTenantByApiKey } from '../services/tenant/tenantLookup.js';
import { assertSessionForTenant } from '../services/sdk/candidateSessions.js';
import { registerSessionPeer, broadcastToSession, postCandidateChatMessage } from '../services/tenant/chat.js';
import { query } from '../config/database.js';
import { wsOnConnect, wsOnDisconnect, wsOnFailed, wsOnHeartbeat } from './wsStats.js';

async function authenticateSdkWs(request, sessionIdFromPath) {
  const host = request.headers.host || 'localhost';
  const reqUrl = new URL(request.url, `http://${host}`);
  const token = reqUrl.searchParams.get('token');
  const apiKey = reqUrl.searchParams.get('x-api-key') || request.headers['x-api-key'];
  const bearer = reqUrl.searchParams.get('bearer');

  if (bearer) {
    try {
      const decoded = verifyTenantAdminToken(bearer);
      const okRoles = new Set(['tenant_admin', 'admin', 'sub_admin', 'proctor', 'viewer']);
      if (!okRoles.has(decoded.role) || !decoded.tenant_id) return null;
      const row = await assertSessionForTenant(decoded.tenant_id, sessionIdFromPath);
      if (!row) return null;
      const dbRole = decoded.role === 'tenant_admin' ? 'admin' : decoded.role;
      if (dbRole === 'proctor' || dbRole === 'viewer') {
        const { proctorOwnsSession } = await import('../middleware/tenantPermissions.js');
        const owns = await proctorOwnsSession(decoded.tenant_id, decoded.sub, dbRole, sessionIdFromPath);
        if (!owns) return null;
      }
      return {
        tenantId: decoded.tenant_id,
        sessionId: sessionIdFromPath,
        role: 'proctor',
        userId: decoded.sub,
        tenantRole: dbRole,
      };
    } catch {
      return null;
    }
  }

  if (token) {
    let decoded;
    try {
      decoded = verifySdkWsToken(token);
    } catch {
      return null;
    }
    if (decoded.sid !== sessionIdFromPath) return null;
    const row = await assertSessionForTenant(decoded.tid, sessionIdFromPath);
    if (!row) return null;
    return { tenantId: decoded.tid, sessionId: sessionIdFromPath, role: 'candidate' };
  }

  if (apiKey) {
    const tenant = await findTenantByApiKey(String(apiKey));
    if (!tenant || tenant.status === 'suspended') return null;
    const row = await assertSessionForTenant(tenant.id, sessionIdFromPath);
    if (!row) return null;
    return { tenantId: tenant.id, sessionId: sessionIdFromPath, role: 'candidate' };
  }

  return null;
}

async function getSessionStatus(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT status, paused_at, scheduled_end, extra_seconds FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  return rows[0] || null;
}

const candidatePeers = new Map();

/** Track candidate connectivity; emits disconnect/reconnect webhooks on state transitions only. */
async function markConnection(ctx, state) {
  const n = (candidatePeers.get(ctx.sessionId) || 0) + (state === 'connected' ? 1 : -1);
  if (n <= 0) candidatePeers.delete(ctx.sessionId);
  else candidatePeers.set(ctx.sessionId, n);
  if (state === 'disconnected' && n > 0) return;
  try {
    const { rows } = await query(
      `UPDATE exam_sessions s
       SET connection_state = $3, last_heartbeat_at = now()
       FROM (SELECT connection_state AS prev FROM exam_sessions WHERE id = $1 AND tenant_id = $2) p
       WHERE s.id = $1 AND s.tenant_id = $2 AND s.connection_state <> 'closed'
         AND s.status NOT IN ('completed', 'failed', 'terminated')
       RETURNING p.prev`,
      [ctx.sessionId, ctx.tenantId, state]
    );
    const prev = rows[0]?.prev;
    if (!prev || prev === state) return;
    const { emitSessionWebhook } = await import('../services/sdk/candidateSessions.js');
    if (state === 'disconnected') await emitSessionWebhook(ctx.tenantId, ctx.sessionId, 'proctoring.session.disconnected');
    else if (prev === 'disconnected') await emitSessionWebhook(ctx.tenantId, ctx.sessionId, 'proctoring.session.reconnected');
  } catch (e) {
    console.warn('[ws] connection state update failed', e.message);
  }
}

function wireClient(ws, ctx) {
  const role = ctx.role || 'candidate';
  ws.send(
    JSON.stringify({
      type: 'connected',
      session_id: ctx.sessionId,
      tenant_id: ctx.tenantId,
      role,
      capabilities: ['ping', 'chat', 'policy_alert', 'timer_sync', 'status_poll', 'live_video'],
    })
  );

  const peer = {
    ws,
    role,
    send: (payload) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    },
  };
  const unsubscribe = registerSessionPeer(ctx.sessionId, peer);
  if (role === 'candidate') void markConnection(ctx, 'connected');
  try {
    wsOnConnect(ctx.tenantId);
  } catch {
    /* ignore */
  }

  let lastBeat = 0;
  ws.on('close', () => {
    try {
      unsubscribe();
    } catch {
      /* ignore */
    }
    if (role === 'candidate') void markConnection(ctx, 'disconnected');
    try {
      wsOnDisconnect(ctx.tenantId);
    } catch {
      /* ignore */
    }
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', detail: 'invalid_json' }));
      return;
    }
    const op = msg.op ?? msg.type;
    if (op === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
      try {
        wsOnHeartbeat(ctx.tenantId);
      } catch {
        /* ignore */
      }
      if (role === 'candidate' && Date.now() - lastBeat > 15_000) {
        lastBeat = Date.now();
        void query(
          `UPDATE exam_sessions SET last_heartbeat_at = now() WHERE id = $1 AND tenant_id = $2`,
          [ctx.sessionId, ctx.tenantId]
        ).catch(() => {});
      }
      return;
    }
    if (op === 'timer_tick') {
      const status = await getSessionStatus(ctx.tenantId, ctx.sessionId);
      ws.send(
        JSON.stringify({
          type: 'timer_ack',
          client_ts: msg.ts,
          server_ts: Date.now(),
          session_status: status?.status,
          paused_at: status?.paused_at,
          scheduled_end: status?.scheduled_end,
        })
      );
      return;
    }
    if (op === 'chat') {
      const message = String(msg.message || '').trim();
      if (!message) return;
      try {
        if (role === 'candidate') {
          await postCandidateChatMessage(ctx.tenantId, ctx.sessionId, { message, metadata: { sent_via: 'ws' } });
        } else {
          const { postProctorChatMessage } = await import('../services/tenant/chat.js');
          await postProctorChatMessage(
            ctx.tenantId,
            ctx.sessionId,
            { message, metadata: { sent_via: 'ws' } },
            { type: 'tenant_user', id: ctx.userId }
          );
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', detail: e.message }));
      }
      return;
    }
    if (op === 'status_poll') {
      const status = await getSessionStatus(ctx.tenantId, ctx.sessionId);
      ws.send(JSON.stringify({ type: 'status', ...status }));
      return;
    }
    if (op === 'live_watch' && role === 'proctor') {
      broadcastToSession(
        ctx.sessionId,
        { type: 'live_watch_request', session_id: ctx.sessionId },
        ws
      );
      return;
    }
    if (op === 'live_signal') {
      const signal = msg.signal;
      if (signal && typeof signal === 'object') {
        broadcastToSession(
          ctx.sessionId,
          { type: 'live_signal', from: role, signal },
          ws
        );
      }
      return;
    }
    ws.send(JSON.stringify({ type: 'ack', echo: msg }));
  });
}

export function attachSdkWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    } catch {
      socket.destroy();
      return;
    }

    const m = pathname.match(/^\/v1\/sdk\/ws\/sessions\/([^/]+)$/);
    if (!m) return;

    const sessionIdFromPath = m[1];

    authenticateSdkWs(request, sessionIdFromPath)
      .then((ctx) => {
        if (!ctx) {
          try {
            wsOnFailed();
          } catch {
            /* ignore */
          }
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wireClient(ws, ctx);
        });
      })
      .catch(() => {
        try {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        } catch {
          /* ignore */
        }
        socket.destroy();
      });
  });
}
