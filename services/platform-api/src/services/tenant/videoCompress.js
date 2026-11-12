import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { abs, ensureDir } from '../../storage/localStorage.js';

/**
 * Compress / remux exam recordings with ffmpeg so files are smaller and
 * still playable (MediaRecorder WebM timeslices are often not seekable alone).
 *
 * Env:
 *   FFMPEG_PATH          – path to ffmpeg binary (default: ffmpeg on PATH)
 *   RECORDING_COMPRESS   – "0"/"false" to skip (default: on)
 *   RECORDING_CRF        – quality 18–35 (default 28; higher = smaller)
 *   RECORDING_PRESET     – ffmpeg x264 preset (default veryfast)
 *   RECORDING_MAX_HEIGHT – scale height cap, e.g. 720 (default 720)
 *   RECORDING_AUDIO_KBIT – audio bitrate kbps (default 64)
 */

export function isRecordingCompressEnabled() {
  const v = String(process.env.RECORDING_COMPRESS ?? '1').toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

export function resolveFfmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function runFfmpeg(args, timeoutMs = 30 * 60 * 1000) {
  const bin = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 32_000) stderr = stderr.slice(-24_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export async function ffmpegAvailable() {
  try {
    await runFfmpeg(['-version'], 8_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-encode a concatenated WebM/MP4 buffer into a compressed MP4 (H.264 + AAC).
 * Returns absolute paths + bytes; throws if ffmpeg fails.
 */
export async function compressRecordingBuffer(rawBuf, {
  workDirRel,
  outputRelKey,
  crf = parseInt(process.env.RECORDING_CRF || '28', 10),
  preset = process.env.RECORDING_PRESET || 'veryfast',
  maxHeight = parseInt(process.env.RECORDING_MAX_HEIGHT || '720', 10),
  audioKbit = parseInt(process.env.RECORDING_AUDIO_KBIT || '64', 10),
} = {}) {
  if (!rawBuf?.length) throw new Error('Empty recording buffer');
  if (!outputRelKey) throw new Error('outputRelKey required');

  const workAbs = abs(workDirRel || path.posix.dirname(outputRelKey) + '/_tmp');
  ensureDir(workAbs);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rawPath = path.join(workAbs, `raw-${stamp}.webm`);
  const outAbs = abs(outputRelKey);
  ensureDir(path.dirname(outAbs));

  fs.writeFileSync(rawPath, rawBuf);

  const vf = Number.isFinite(maxHeight) && maxHeight > 0
    ? [`-vf`, `scale=-2:'min(${maxHeight},ih)'`]
    : [];

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', rawPath,
    ...vf,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', String(Math.min(35, Math.max(18, crf || 28))),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', `${audioKbit || 64}k`,
    '-ac', '1',
    '-movflags', '+faststart',
    outAbs,
  ];

  try {
    await runFfmpeg(args);
  } finally {
    try {
      fs.unlinkSync(rawPath);
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(outAbs)) throw new Error('ffmpeg produced no output');
  const st = fs.statSync(outAbs);
  if (!st.size) throw new Error('ffmpeg produced empty output');

  return {
    outputRelKey,
    bytes: st.size,
    mime_type: 'video/mp4',
    ext: 'mp4',
    crf,
    preset,
    maxHeight,
  };
}
