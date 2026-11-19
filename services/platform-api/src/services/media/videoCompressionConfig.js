/**
 * Configurable dual-storage video compression settings.
 * Safe defaults; all values overridable via env.
 */

const PROFILES = {
  HIGH_QUALITY: { crf: 32, preset: '6', label: 'high_quality' },
  BALANCED: { crf: 36, preset: '6', label: 'balanced' },
  HIGH_COMPRESSION: { crf: 40, preset: '6', label: 'high_compression' },
  AGGRESSIVE: { crf: 42, preset: '6', label: 'aggressive' },
};

function envBool(name, defaultTrue = true) {
  const v = process.env[name];
  if (v == null || v === '') return defaultTrue;
  return !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase());
}

function envInt(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getCompressionProfiles() {
  return { ...PROFILES };
}

export function getVideoCompressionConfig() {
  const profileName = String(process.env.VIDEO_COMPRESSION_PROFILE || 'BALANCED').toUpperCase();
  const profile = PROFILES[profileName] || PROFILES.BALANCED;
  const crf = envInt('VIDEO_COMPRESSION_CRF', profile.crf);
  return {
    enabled: envBool('VIDEO_COMPRESSION_ENABLED', true) && envBool('RECORDING_COMPRESS', true),
    codec: String(process.env.VIDEO_COMPRESSION_CODEC || 'av1').toLowerCase(),
    encoder: String(process.env.VIDEO_COMPRESSION_ENCODER || 'libsvtav1'),
    preset: String(process.env.VIDEO_COMPRESSION_PRESET || profile.preset),
    crf: Math.min(51, Math.max(20, crf)),
    width: envInt('VIDEO_COMPRESSION_WIDTH', 854),
    height: envInt('VIDEO_COMPRESSION_HEIGHT', 480),
    fps: envInt('VIDEO_COMPRESSION_FPS', 15),
    audioCodec: String(process.env.VIDEO_COMPRESSION_AUDIO_CODEC || 'libopus'),
    audioBitrate: String(process.env.VIDEO_COMPRESSION_AUDIO_BITRATE || '48k'),
    chunkDurationMs: envInt('VIDEO_COMPRESSION_CHUNK_DURATION', 5) * 1000,
    maxWorkers: Math.max(1, envInt('VIDEO_COMPRESSION_MAX_WORKERS', 1)),
    maxRetries: Math.max(0, envInt('VIDEO_COMPRESSION_MAX_RETRIES', 3)),
    timeoutSeconds: Math.max(60, envInt('VIDEO_COMPRESSION_TIMEOUT_SECONDS', 7200)),
    generateH264Fallback: envBool('VIDEO_COMPRESSION_GENERATE_H264_FALLBACK', false),
    keepOriginal: envBool('VIDEO_COMPRESSION_KEEP_ORIGINAL', true),
    profile: profile.label,
    profileName,
    /** Legacy H.264 sync path knobs (still used as encoder fallback). */
    h264Crf: envInt('RECORDING_CRF', 26),
    h264Preset: String(process.env.RECORDING_PRESET || 'medium'),
    h264AudioKbit: envInt('RECORDING_AUDIO_KBIT', 64),
  };
}

/** Reserved sequences for dual-storage rows (segments use 0..N). */
export const ORIGINAL_SEQUENCE = 999998;
export const COMPRESSED_SEQUENCE = 999999;
export const FALLBACK_SEQUENCE = 999997;

/** @deprecated use COMPRESSED_SEQUENCE — kept for callers that still import MERGED_SEQUENCE */
export const MERGED_SEQUENCE = COMPRESSED_SEQUENCE;
