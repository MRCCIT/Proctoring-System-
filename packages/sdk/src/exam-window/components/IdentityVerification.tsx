'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProctorShieldClient } from '../../core/ProctorShieldClient';
import { bindStreamToVideo, captureFrameFromStream } from '../../media/captureFrame';
import {
  DEFAULT_IDENTITY_MIN_SIMILARITY,
  isIdentityVerified,
  normalizeMinSimilarity,
} from '../../ai-client/identityMatch';

export interface IdentityVerificationProps {
  client: ProctorShieldClient;
  sessionId: string;
  /** Camera stream from the permission gate */
  cameraStream: MediaStream | null;
  brandPrimary?: string;
  /** Optional: reference photo as a data URL/base64 (e.g. uploaded ID photo) */
  referenceImage?: string;
  /** Optional: reference photo HTTP URL (signed, fetched by the Python sidecar) */
  referenceUrl?: string;
  /** Minimum ArcFace similarity (0–100 scale); default 55 */
  minSimilarity?: number;
  onDone: (info: { image_base64: string; match?: { similarity: number; verified: boolean; detector: string } }) => void;
}

interface ServerCompareResponse {
  data?: {
    similarity?: number;
    verified?: boolean;
    detector?: string;
    distance?: number;
  };
}

export function IdentityVerification(props: IdentityVerificationProps) {
  const {
    client,
    sessionId,
    cameraStream,
    brandPrimary = '#0f172a',
    referenceImage,
    referenceUrl,
    minSimilarity = DEFAULT_IDENTITY_MIN_SIMILARITY,
    onDone,
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<{ similarity: number; verified: boolean; detector: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      void bindStreamToVideo(cameraStream, videoRef.current);
    }
  }, [cameraStream]);

  const capture = async () => {
    const v = videoRef.current;
    if (!v) return;
    const frame = await captureFrameFromStream(cameraStream, v);
    if (!frame) {
      setErr('Could not capture from camera. Allow camera access and try again.');
      return;
    }
    setCaptured(frame);
    setMatch(null);
    setErr(null);
  };

  const hasReference = Boolean(referenceImage || referenceUrl);
  const minPct = normalizeMinSimilarity(minSimilarity);

  const submit = async () => {
    if (!captured) return;
    if (!hasReference) {
      setErr(
        'No enrolled reference photo found for this candidate (e.g. savej). ' +
          'Run db:seed with assets/savej-reference.png and use external ref "savej", or enroll a photo in tenant admin.'
      );
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await client.submitIdentity(sessionId, { image_base64: captured });

      let result: { similarity: number; verified: boolean; detector: string } | undefined;
      try {
        // `captured` is always a data URL from the webcam canvas — never send it as live_url
        // (AI load_image_from_url only accepts http/https). Prefer image pair; if only a
        // reference HTTP URL exists, send profile_url + live_image (mixed).
        const body = referenceImage
          ? { reference_image: referenceImage, live_image: captured, identity_threshold: minPct }
          : referenceUrl
            ? { profile_url: referenceUrl, live_image: captured, identity_threshold: minPct }
            : { reference_image: referenceImage!, live_image: captured, identity_threshold: minPct };
        const resp = (await client.faceCompareAi(sessionId, body)) as ServerCompareResponse;
        const sim = Number(resp?.data?.similarity ?? 0);
        const verified = isIdentityVerified(resp?.data, minPct);
        result = {
          similarity: sim,
          verified,
          detector: String(resp?.data?.detector || 'arcface'),
        };
        setMatch(result);
        if (!verified) {
          setErr(
            `Identity check failed — similarity ${sim.toFixed(1)}% is below required ${minPct.toFixed(0)}%. ` +
              'Only the enrolled candidate may proceed. Retake with your face centered and well lit.'
          );
          return;
        }
      } catch (e) {
        setErr(
          `Identity verification could not run (${(e as Error).message}). ` +
            'Start the AI server: npm run dev:ai (port 5055), then retake your photo.'
        );
        return;
      }
      onDone({ image_base64: captured, match: result });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 4 }}>Identity verification</h2>
      <p style={{ color: '#475569', fontSize: 14, marginBottom: 12 }}>
        Center your face inside the frame, look straight at the camera, then click Capture.
        {hasReference && ' Your photo will be matched against your registered ID using ArcFace.'}
      </p>
      <div style={{ position: 'relative', maxWidth: 480, marginBottom: 12 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: '100%',
            aspectRatio: '4/3',
            background: '#000',
            borderRadius: 12,
            display: captured ? 'none' : 'block',
          }}
        />
        {captured && (
          <img
            src={captured}
            alt="Captured"
            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 12 }}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!captured ? (
          <button
            type="button"
            onClick={() => void capture()}
            style={{
              background: brandPrimary,
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Capture photo
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setCaptured(null);
                setMatch(null);
              }}
              style={{
                background: '#64748b',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Retake
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              style={{
                background: brandPrimary,
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {busy ? 'Verifying…' : hasReference ? 'Match & start exam' : 'Verify & start exam'}
            </button>
          </>
        )}
      </div>
      {match && (
        <p
          style={{
            color: match.verified ? '#15803d' : '#b45309',
            fontSize: 13,
            marginTop: 12,
          }}
        >
          {match.verified ? 'Identity match' : 'Identity weak match'} —{' '}
          similarity {match.similarity.toFixed(2)} via {match.detector}.
        </p>
      )}
      {err && <p style={{ color: '#b91c1c', fontSize: 13, marginTop: 12 }}>{err}</p>}
    </section>
  );
}
