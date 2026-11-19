import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { abs, ensureDir } from '../../storage/localStorage.js';
import { getVideoCompressionConfig } from '../media/videoCompressionConfig.js';

/**
 * Dual-storage FFmpeg helpers: AV1 (SVT) preferred, then VP9, then H.264.
 * Always use spawn argv arrays — never shell:true.
 */

let encoderCache = null;

export function isRecordingCompressEnabled() {
  return getVideoCompressionConfig().enabled;
}

export function resolveFfmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

export function resolveFfprobePath() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const ffmpeg = resolveFfmpegPath();
  if (ffmpeg.toLowerCase().includes('ffmpeg')) {
    return ffmpeg.replace(/ffmpeg(\.exe)?$/i, (_, ext) => `ffprobe${ext || ''}`);
  }
  return 'ffprobe';
}

function runProcess(bin, args, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
      if (stdout.length > 64_000) stdout = stdout.slice(-48_000);
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-48_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

function runFfmpeg(args, timeoutMs) {
  return runProcess(resolveFfmpegPath(), args, timeoutMs);
}

export async function ffmpegAvailable() {
  try {
    await runFfmpeg(['-version'], 8_000);
    return true;
  } catch {
    return false;
  }
}

export async function detectEncoders() {
  if (encoderCache) return encoderCache;
  try {
    const { stdout, stderr } = await runFfmpeg(['-hide_banner', '-encoders'], 12_000);
    const text = `${stdout}\n${stderr}`;
    encoderCache = {
      av1: /\blibsvtav1\b/.test(text),
      vp9: /\blibvpx-vp9\b/.test(text),
      x264: /\blibx264\b/.test(text),
      opus: /\blibopus\b/.test(text),
      aac: /\baac\b/.test(text),
    };
  } catch {
    encoderCache = { av1: false, vp9: false, x264: false, opus: false, aac: false };
  }
  return encoderCache;
}

export function sha256File(absPath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(absPath));
  return hash.digest('hex');
}

export function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function scaleFilter(cfg) {
  const w = cfg.width || 854;
  const h = cfg.height || 480;
  const fps = cfg.fps || 15;
  return `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
}

/**
 * Pick best available compressed output strategy.
 * @returns {{ kind: 'av1'|'vp9'|'h264', videoCodec: string, audioCodec: string, ext: string, mime: string }}
 */
export async function pickCompressionStrategy(cfg = getVideoCompressionConfig()) {
  const enc = await detectEncoders();
  const want = cfg.codec || 'av1';
  if ((want === 'av1' || cfg.encoder === 'libsvtav1') && enc.av1) {
    return {
      kind: 'av1',
      videoCodec: 'libsvtav1',
      audioCodec: enc.opus ? 'libopus' : enc.aac ? 'aac' : 'libopus',
      ext: 'webm',
      mime: 'video/webm',
    };
  }
  if (enc.vp9) {
    return {
      kind: 'vp9',
      videoCodec: 'libvpx-vp9',
      audioCodec: enc.opus ? 'libopus' : enc.aac ? 'aac' : 'libopus',
      ext: 'webm',
      mime: 'video/webm',
    };
  }
  if (enc.x264) {
    return {
      kind: 'h264',
      videoCodec: 'libx264',
      audioCodec: enc.aac ? 'aac' : 'aac',
      ext: 'mp4',
      mime: 'video/mp4',
    };
  }
  throw new Error('No suitable video encoder (libsvtav1 / libvpx-vp9 / libx264) found in ffmpeg');
}

export async function probeMedia(absPath) {
  const bin = resolveFfprobePath();
  const { stdout } = await runProcess(
    bin,
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      absPath,
    ],
    30_000
  );
  return JSON.parse(stdout || '{}');
}

export async function validateCompressedOutput(absPath, {
  strategy,
  cfg,
  originalDurationSec = null,
} = {}) {
  if (!fs.existsSync(absPath)) throw new Error('Compressed output missing');
  const st = fs.statSync(absPath);
  if (!st.size) throw new Error('Compressed output empty');

  const probe = await probeMedia(absPath);
  const v = (probe.streams || []).find((s) => s.codec_type === 'video');
  const a = (probe.streams || []).find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('No video stream in compressed output');

  const codec = String(v.codec_name || '').toLowerCase();
  if (strategy?.kind === 'av1' && !codec.includes('av1')) {
    throw new Error(`Expected AV1 codec, got ${codec}`);
  }
  if (strategy?.kind === 'vp9' && !codec.includes('vp9')) {
    throw new Error(`Expected VP9 codec, got ${codec}`);
  }
  if (strategy?.kind === 'h264' && !['h264', 'avc1'].includes(codec)) {
    throw new Error(`Expected H.264 codec, got ${codec}`);
  }

  const w = Number(v.width);
  const h = Number(v.height);
  if (cfg?.width && Math.abs(w - cfg.width) > 8) {
    throw new Error(`Unexpected width ${w} (want ~${cfg.width})`);
  }
  if (cfg?.height && Math.abs(h - cfg.height) > 8) {
    throw new Error(`Unexpected height ${h} (want ~${cfg.height})`);
  }

  const duration = Number(probe.format?.duration);
  if (originalDurationSec != null && Number.isFinite(duration) && Number.isFinite(originalDurationSec) && originalDurationSec > 1) {
    const ratio = duration / originalDurationSec;
    if (ratio < 0.85 || ratio > 1.15) {
      throw new Error(`Duration mismatch compressed=${duration}s original=${originalDurationSec}s`);
    }
  }

  // Decode smoke test
  await runFfmpeg(['-v', 'error', '-i', absPath, '-f', 'null', '-'], Math.min(getVideoCompressionConfig().timeoutSeconds * 1000, 600_000));

  return {
    bytes: st.size,
    codec,
    audio_codec: a ? String(a.codec_name || '') : null,
    width: w || null,
    height: h || null,
    fps: v.avg_frame_rate && v.avg_frame_rate.includes('/')
      ? (() => {
          const [n, d] = v.avg_frame_rate.split('/').map(Number);
          return d ? n / d : null;
        })()
      : null,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    has_audio: Boolean(a),
  };
}

/**
 * Compress a source media file on disk into outputRelKey.
 */
export async function compressRecordingFile(inputAbsOrRel, {
  outputRelKey,
  preferH264 = false,
  cfg = getVideoCompressionConfig(),
} = {}) {
  if (!outputRelKey) throw new Error('outputRelKey required');
  const inputAbs = path.isAbsolute(inputAbsOrRel) ? inputAbsOrRel : abs(inputAbsOrRel);
  if (!fs.existsSync(inputAbs)) throw new Error('Input recording missing');

  const strategy = preferH264
    ? { kind: 'h264', videoCodec: 'libx264', audioCodec: 'aac', ext: 'mp4', mime: 'video/mp4' }
    : await pickCompressionStrategy(cfg);

  const outAbs = abs(outputRelKey);
  ensureDir(path.dirname(outAbs));
  const tmpAbs = `${outAbs}.tmp-${Date.now()}`;
  const timeoutMs = (cfg.timeoutSeconds || 7200) * 1000;
  const vf = scaleFilter(cfg);

  let args;
  if (strategy.kind === 'av1') {
    args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputAbs,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', vf,
      '-c:v', 'libsvtav1',
      '-preset', String(cfg.preset || '6'),
      '-crf', String(cfg.crf),
      '-g', String((cfg.fps || 15) * 4),
      '-pix_fmt', 'yuv420p',
      '-c:a', strategy.audioCodec,
      '-b:a', cfg.audioBitrate || '48k',
      '-ac', '1',
      '-f', 'webm',
      tmpAbs,
    ];
  } else if (strategy.kind === 'vp9') {
    args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputAbs,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', vf,
      '-c:v', 'libvpx-vp9',
      '-crf', String(cfg.crf),
      '-b:v', '0',
      '-row-mt', '1',
      '-pix_fmt', 'yuv420p',
      '-c:a', strategy.audioCodec,
      '-b:a', cfg.audioBitrate || '48k',
      '-ac', '1',
      '-f', 'webm',
      tmpAbs,
    ];
  } else {
    args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputAbs,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', cfg.h264Preset || 'medium',
      '-crf', String(cfg.h264Crf || 26),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', `${cfg.h264AudioKbit || 64}k`,
      '-ac', '1',
      '-movflags', '+faststart',
      tmpAbs,
    ];
  }

  try {
    await runFfmpeg(args, timeoutMs);
    if (!fs.existsSync(tmpAbs) || !fs.statSync(tmpAbs).size) {
      throw new Error('ffmpeg produced empty temp output');
    }
    fs.renameSync(tmpAbs, outAbs);
  } catch (e) {
    try {
      if (fs.existsSync(tmpAbs)) fs.unlinkSync(tmpAbs);
    } catch {
      /* ignore */
    }
    throw e;
  }

  let originalDuration = null;
  try {
    const op = await probeMedia(inputAbs);
    originalDuration = Number(op.format?.duration);
  } catch {
    /* ignore */
  }

  const validation = await validateCompressedOutput(outAbs, { strategy, cfg, originalDurationSec: originalDuration });
  return {
    outputRelKey,
    bytes: validation.bytes,
    mime_type: strategy.mime,
    ext: strategy.ext,
    strategy: strategy.kind,
    codec: validation.codec,
    audio_codec: validation.audio_codec,
    width: validation.width,
    height: validation.height,
    fps: validation.fps,
    duration_seconds: validation.duration_seconds,
    checksum_sha256: sha256File(outAbs),
    profile: cfg.profile,
    crf: cfg.crf,
  };
}

/**
 * Legacy buffer API — write buffer to temp then compress (H.264-compatible path).
 * Kept for older callers; new pipeline prefers compressRecordingFile on assembled original.
 */
export async function compressRecordingBuffer(rawBuf, {
  workDirRel,
  outputRelKey,
  crf,
  preset,
  maxHeight,
  audioKbit,
} = {}) {
  if (!rawBuf?.length) throw new Error('Empty recording buffer');
  if (!outputRelKey) throw new Error('outputRelKey required');

  const workAbs = abs(workDirRel || path.posix.dirname(outputRelKey) + '/_tmp');
  ensureDir(workAbs);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rawPath = path.join(workAbs, `raw-${stamp}.webm`);
  fs.writeFileSync(rawPath, rawBuf);

  const cfg = getVideoCompressionConfig();
  if (crf != null) cfg.crf = crf;
  if (preset) cfg.preset = preset;
  if (maxHeight) cfg.height = maxHeight;
  if (audioKbit) cfg.h264AudioKbit = audioKbit;

  try {
    // Prefer H.264 for buffer path (seekable MP4) to preserve prior behavior for sync callers.
    return await compressRecordingFile(rawPath, { outputRelKey, preferH264: true, cfg });
  } finally {
    try {
      fs.unlinkSync(rawPath);
    } catch {
      /* ignore */
    }
  }
}
