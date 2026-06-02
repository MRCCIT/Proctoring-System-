'use client';

import { useEffect, useRef, useState } from 'react';
import { LockdownEnforcer } from '../../lockdown/LockdownEnforcer';
import { CloudInference } from '../../ai-client/CloudInference';
import { captureVideoFrame } from '../../media/SnapshotCapture';
import type { ProctorShieldClient } from '../../core/ProctorShieldClient';
import { ViolationAlert } from './ViolationAlert';
import { ProctoringTimer } from './ProctoringTimer';
import { ProctoringIndicator } from './ProctoringIndicator';

export function ExamFrame(props: {
  client: ProctorShieldClient;
  sessionId: string;
  examUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const cloud = new CloudInference(props.client);

  useEffect(() => {
    const lock = new LockdownEnforcer();
    lock.start((reason) => setViolations((v) => [...v, reason]));
    void props.client.startStream(props.sessionId, { transport: 'webrtc' });
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    });
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        const image = await captureVideoFrame(video);
        const res = await cloud.analyzeFrame(props.sessionId, image, true);
        const analysis = (res as { data?: { analysis?: { violations?: string[] } } }).data?.analysis;
        if (analysis?.violations?.length) {
          setViolations((v) => [...new Set([...v, ...analysis.violations!])]);
        }
      } catch {
        /* AI sidecar optional */
      }
    }, 4000);
    return () => {
      clearInterval(interval);
      lock.stop();
    };
  }, [props.client, props.sessionId]);

  return (
    <section>
      <ProctoringTimer startedAt={Date.now()} />
      <ProctoringIndicator active sessionId={props.sessionId} />
      <ViolationAlert violations={violations} />
      <video ref={videoRef} autoPlay muted playsInline style={{ width: 160, position: 'fixed', bottom: 16, right: 16 }} />
      {props.examUrl ? (
        <iframe title="Exam" src={props.examUrl} style={{ width: '100%', height: '70vh', border: '1px solid #e2e8f0' }} />
      ) : (
        <p>Exam content area — set examUrl prop or embed your LMS iframe.</p>
      )}
    </section>
  );
}
