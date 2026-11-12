import { query } from '../../config/database.js';
import { readFileSafe, writeBuffer } from '../../storage/index.js';

/**
 * Post-exam media stub: HLS playlist placeholder + violation clip metadata.
 * When ffmpeg is available (FFMPEG_PATH or `ffmpeg` on PATH), extend this to transcode chunks.
 */
export async function runPostExamMediaJob(tenantId, sessionId) {
  const { rows: violations } = await query(
    `SELECT id, event_type, occurred_at, severity
       FROM session_events
      WHERE tenant_id = $1 AND session_id = $2
        AND event_type LIKE 'violation.%'
      ORDER BY occurred_at ASC LIMIT 50`,
    [tenantId, sessionId]
  );

  const playlistKey = `recordings/${tenantId}/${sessionId}/merged/session-playlist.m3u8`;
  const stubPlaylist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:10',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '# POST-EXAM STUB — wire ffmpeg concat when FFMPEG_PATH is set',
    '#EXT-X-ENDLIST',
  ].join('\n');

  await writeBuffer(playlistKey, Buffer.from(stubPlaylist, 'utf8'));

  const clips = [];
  for (const v of violations) {
    const clipKey = `${tenantId}/${sessionId}/clips/${v.id}.json`;
    const meta = {
      session_id: sessionId,
      event_id: v.id,
      event_type: v.event_type,
      severity: v.severity,
      occurred_at: v.occurred_at,
      hls_stub: playlistKey,
      ffmpeg: process.env.FFMPEG_PATH ? 'optional' : 'missing',
      note:
        process.env.FFMPEG_PATH || process.env.SKIP_FFMPEG
          ? 'Configure FFMPEG_PATH for real ±10s violation clips.'
          : 'ffmpeg not configured — metadata only.',
    };
    await writeBuffer(clipKey, Buffer.from(JSON.stringify(meta), 'utf8'));
    clips.push({ event_id: v.id, object_key: clipKey });
  }

  await query(
    `UPDATE exam_sessions
        SET sdk_init_meta = COALESCE(sdk_init_meta, '{}'::jsonb) || $3::jsonb,
            updated_at = now()
      WHERE id = $1 AND tenant_id = $2`,
  [
    sessionId,
    tenantId,
    JSON.stringify({
      post_exam_media: {
        playlist_key: playlistKey,
        clip_count: clips.length,
        processed_at: new Date().toISOString(),
      },
    }),
  ]);

  void readFileSafe(playlistKey);
  return { playlist_key: playlistKey, clips };
}
