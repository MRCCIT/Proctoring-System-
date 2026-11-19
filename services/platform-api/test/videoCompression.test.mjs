import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVideoCompressionConfig,
  getCompressionProfiles,
  ORIGINAL_SEQUENCE,
  COMPRESSED_SEQUENCE,
  FALLBACK_SEQUENCE,
} from '../src/services/media/videoCompressionConfig.js';
import {
  preferRecordingSource,
  savingsPercent,
  shouldSkipCompressJob,
} from '../src/services/media/recordingPlaybackPrefer.js';
import { pickCompressionStrategy, detectEncoders } from '../src/services/tenant/videoCompress.js';

test('reserved sequences are dual-storage ordered', () => {
  assert.equal(FALLBACK_SEQUENCE, 999997);
  assert.equal(ORIGINAL_SEQUENCE, 999998);
  assert.equal(COMPRESSED_SEQUENCE, 999999);
});

test('VIDEO_COMPRESSION defaults are safe for local/dev', () => {
  const cfg = getVideoCompressionConfig();
  assert.equal(cfg.width, 854);
  assert.equal(cfg.height, 480);
  assert.equal(cfg.fps, 15);
  assert.equal(cfg.keepOriginal, true);
  assert.equal(cfg.generateH264Fallback, false);
  assert.ok(cfg.crf >= 20 && cfg.crf <= 51);
  assert.ok(cfg.maxWorkers >= 1);
  const profiles = getCompressionProfiles();
  assert.ok(profiles.BALANCED);
  assert.ok(profiles.AGGRESSIVE);
});

test('evidence prefers compressed completed over fallback and original', () => {
  const picked = preferRecordingSource({
    original: { url: '/o', compression_status: 'pending' },
    compressed: { url: '/c', compression_status: 'completed' },
    fallback: { url: '/f', compression_status: 'completed' },
  });
  assert.equal(picked.key, 'compressed');
});

test('evidence falls back to H.264 then original when compress incomplete', () => {
  const mid = preferRecordingSource({
    original: { url: '/o' },
    compressed: { url: '/c', compression_status: 'processing' },
    fallback: { url: '/f', compression_status: 'completed' },
  });
  assert.equal(mid.key, 'fallback');

  const orig = preferRecordingSource({
    original: { url: '/o' },
    compressed: { url: '/c', compression_status: 'compression_failed' },
    fallback: null,
  });
  assert.equal(orig.key, 'original');
});

test('savings percent and idempotent skip helpers', () => {
  assert.equal(savingsPercent(1000, 400), 60);
  assert.equal(savingsPercent(0, 10), null);
  assert.equal(
    shouldSkipCompressJob({
      force: false,
      existingStatus: 'completed',
      existingOriginalChecksum: 'abc',
      currentOriginalChecksum: 'abc',
    }),
    true
  );
  assert.equal(
    shouldSkipCompressJob({
      force: true,
      existingStatus: 'completed',
      existingOriginalChecksum: 'abc',
      currentOriginalChecksum: 'abc',
    }),
    false
  );
  assert.equal(
    shouldSkipCompressJob({
      force: false,
      existingStatus: 'completed',
      existingOriginalChecksum: 'abc',
      currentOriginalChecksum: 'xyz',
    }),
    false
  );
});

test('pickCompressionStrategy returns a known kind when ffmpeg encoders exist', async () => {
  const enc = await detectEncoders();
  if (!enc.av1 && !enc.vp9 && !enc.x264) {
    await assert.rejects(() => pickCompressionStrategy(), /No suitable video encoder/);
    return;
  }
  const strategy = await pickCompressionStrategy();
  assert.ok(['av1', 'vp9', 'h264'].includes(strategy.kind));
  assert.ok(strategy.ext);
  assert.ok(strategy.mime);
});
