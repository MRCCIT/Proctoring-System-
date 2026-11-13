import fs from 'fs';
import { asyncHandler } from '../utils/asyncHandler.js';
import { resolveRecordingRequest, resolveSessionReportRequest } from '../services/tenant/mediaAccess.js';
import { problemDetails, ProblemTypes } from '../utils/problemDetails.js';
import { query } from '../config/database.js';
import { abs, statSafe } from '../storage/localStorage.js';
import { isUuid } from '../utils/validation.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { verifyResourceToken } from '../utils/jwt.js';

/** Video elements cannot send Authorization headers; allow JWT via query for GET media only. */
function requireTenantMediaContext(req, res, next) {
  if (!req.headers.authorization && req.query.access_token) {
    req.headers.authorization = `Bearer ${String(req.query.access_token)}`;
  }
  return requireTenantContext(req, res, next);
}

function pipeLocalFile(res, filePath) {
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).type('application/problem+json').json(
        problemDetails({
          type: ProblemTypes.internal,
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to read media file',
        })
      );
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

/** Serve a local file with HTTP Range support so browsers can seek video. */
function serveLocalFile(req, res, relPath, mime, size, downloadName) {
  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (downloadName) {
    res.setHeader('Content-Disposition', `inline; filename="${String(downloadName).replace(/"/g, '')}"`);
  }
  const range = req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && size > 0) {
    let start = m[1] === '' ? Math.max(0, size - parseInt(m[2], 10)) : parseInt(m[1], 10);
    let end = m[1] !== '' && m[2] !== '' ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || start >= size || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      return res.end();
    }
    end = Math.min(end, size - 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    const stream = fs.createReadStream(abs(relPath), { start, end });
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }
  res.setHeader('Content-Length', String(size));
  return pipeLocalFile(res, abs(relPath));
}

export function registerMediaRoutes(app) {
  app.get(
    '/v1/media/evidence',
    asyncHandler(async (req, res) => {
      let claims;
      try {
        claims = verifyResourceToken(String(req.query.token || ''));
      } catch {
        claims = null;
      }
      if (!claims || claims.typ !== 'evidence' || !claims.tid || !claims.id) {
        return res.status(401).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.unauthorized,
            title: 'Unauthorized',
            status: 401,
            detail: 'Evidence link is invalid or has expired.',
          })
        );
      }
      let row;
      if (claims.kind === 'recording') {
        const { rows } = await query(
          `SELECT file_path, mime_type, metadata FROM session_recording_chunks WHERE id = $1 AND tenant_id = $2`,
          [claims.id, claims.tid]
        );
        row = rows[0];
      } else if (claims.kind === 'snapshot') {
        const { rows } = await query(
          `SELECT file_path, mime_type, NULL::jsonb AS metadata FROM session_snapshots WHERE id = $1 AND tenant_id = $2`,
          [claims.id, claims.tid]
        );
        row = rows[0];
      }
      if (!row || !row.file_path) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Evidence not found' })
        );
      }
      const st = statSafe(row.file_path);
      if (!st) {
        return res.status(410).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Gone', status: 410, detail: 'Evidence file missing' })
        );
      }
      const fallback = claims.kind === 'snapshot' ? 'image/jpeg' : 'video/webm';
      return serveLocalFile(req, res, row.file_path, row.mime_type || fallback, st.size, row.metadata?.display_name);
    })
  );

  app.get(
    '/v1/media/recording',
    asyncHandler(async (req, res) => {
      const token = req.query.token;
      if (!token) {
        return res.status(400).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.validation,
            title: 'Validation Error',
            status: 400,
            detail: 'Query parameter "token" is required.',
          })
        );
      }
      try {
        const row = await resolveRecordingRequest(String(token));
        res.json({
          data: {
            session_id: row.id,
            object_key: row.recording_object_key,
            status: row.status,
            note: 'Signed access validated. Wire CDN/object storage delivery here.',
          },
        });
      } catch (e) {
        if (e.status === 401 || e.status === 404) {
          return res.status(e.status).type('application/problem+json').json(
            problemDetails({
              type: e.status === 404 ? ProblemTypes.notFound : ProblemTypes.unauthorized,
              title: e.status === 404 ? 'Not Found' : 'Unauthorized',
              status: e.status,
              detail: e.message,
            })
          );
        }
        throw e;
      }
    })
  );

  app.get(
    '/v1/media/recordings/:chunkId',
    requireTenantMediaContext,
    asyncHandler(async (req, res) => {
      const { chunkId } = req.params;
      if (!/^\d+$/.test(chunkId)) {
        return res.status(400).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid chunk id' })
        );
      }
      const { rows } = await query(
        `SELECT file_path, mime_type, metadata FROM session_recording_chunks WHERE id = $1 AND tenant_id = $2`,
        [chunkId, req.tenantContext.tenantId]
      );
      const row = rows[0];
      if (!row || !row.file_path) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Chunk file not stored locally' })
        );
      }
      const st = statSafe(row.file_path);
      if (!st) {
        return res.status(410).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Gone', status: 410, detail: 'File missing on disk' })
        );
      }
      let meta = row.metadata;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch {
          meta = {};
        }
      }
      const downloadName = meta?.display_name || `recording-${chunkId}.webm`;
      serveLocalFile(req, res, row.file_path, row.mime_type || 'video/webm', st.size, downloadName);
    })
  );

  app.get(
    '/v1/media/snapshots/:snapshotId',
    requireTenantMediaContext,
    asyncHandler(async (req, res) => {
      const { snapshotId } = req.params;
      if (!isUuid(snapshotId)) {
        return res.status(400).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.validation, title: 'Validation Error', status: 400, detail: 'Invalid snapshot id' })
        );
      }
      const { rows } = await query(
        `SELECT file_path, mime_type FROM session_snapshots WHERE id = $1 AND tenant_id = $2`,
        [snapshotId, req.tenantContext.tenantId]
      );
      const row = rows[0];
      if (!row || !row.file_path) {
        return res.status(404).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Not Found', status: 404, detail: 'Snapshot file not stored locally' })
        );
      }
      const st = statSafe(row.file_path);
      if (!st) {
        return res.status(410).type('application/problem+json').json(
          problemDetails({ type: ProblemTypes.notFound, title: 'Gone', status: 410, detail: 'File missing on disk' })
        );
      }
      res.setHeader('Content-Type', row.mime_type || 'image/jpeg');
      res.setHeader('Content-Length', String(st.size));
      pipeLocalFile(res, abs(row.file_path));
    })
  );

  app.get(
    '/v1/media/session-report',
    asyncHandler(async (req, res) => {
      const token = req.query.token;
      if (!token) {
        return res.status(400).type('application/problem+json').json(
          problemDetails({
            type: ProblemTypes.validation,
            title: 'Validation Error',
            status: 400,
            detail: 'Query parameter "token" is required.',
          })
        );
      }
      try {
        const row = await resolveSessionReportRequest(String(token));
        const { renderSessionIntegrityPdf } = await import('../services/exports/sessionIntegrityPdf.js');
        const buf = await renderSessionIntegrityPdf(row.tenant_id, row.id);
        if (!buf) {
          return res.status(404).type('application/problem+json').json(
            problemDetails({
              type: ProblemTypes.notFound,
              title: 'Not Found',
              status: 404,
              detail: 'Session report could not be generated.',
            })
          );
        }
        const name = `integrity-report-${String(row.id).slice(0, 8)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${name}"`);
        res.setHeader('Content-Length', String(buf.length));
        return res.send(buf);
      } catch (e) {
        if (e.status === 401 || e.status === 404) {
          return res.status(e.status).type('application/problem+json').json(
            problemDetails({
              type: e.status === 404 ? ProblemTypes.notFound : ProblemTypes.unauthorized,
              title: e.status === 404 ? 'Not Found' : 'Unauthorized',
              status: e.status,
              detail: e.message,
            })
          );
        }
        throw e;
      }
    })
  );
}
