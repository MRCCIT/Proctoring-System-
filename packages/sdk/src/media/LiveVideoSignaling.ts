import type { ProctorChatClient } from '../events/ProctorChatClient';
import type { ProctorShieldClient } from '../core/ProctorShieldClient';
import { TURNResolver } from './TURNResolver';

export type LiveVideoRole = 'candidate' | 'proctor';

export interface LiveVideoSignalingOptions {
  role: LiveVideoRole;
  chat: ProctorChatClient;
  getLocalStream: () => MediaStream | null;
  onRemoteStream?: (stream: MediaStream) => void;
  iceServers?: RTCIceServer[];
}

type SignalPayload =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

/**
 * WebRTC publish/subscribe for proctor live view, with SDP/ICE relayed over the session WebSocket.
 */
export class LiveVideoSignaling {
  private pc: RTCPeerConnection | null = null;
  private offChat?: () => void;
  private readonly polite: boolean;

  private constructor(
    private readonly role: LiveVideoRole,
    private readonly chat: ProctorChatClient,
    private readonly getLocalStream: () => MediaStream | null,
    private readonly onRemoteStream: ((stream: MediaStream) => void) | undefined,
    private readonly iceServers: RTCIceServer[]
  ) {
    this.polite = role === 'proctor';
  }

  static async create(client: ProctorShieldClient, opts: Omit<LiveVideoSignalingOptions, 'iceServers'>) {
    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const turn = await new TURNResolver(client).resolve();
      if (turn?.ice_servers?.length) iceServers = turn.ice_servers;
    } catch {
      /* STUN only */
    }
    return new LiveVideoSignaling(opts.role, opts.chat, opts.getLocalStream, opts.onRemoteStream, iceServers);
  }

  start() {
    this.offChat = this.chat.on((msg) => void this.onWsMessage(msg));
    if (this.role === 'proctor') {
      this.chat.send({ op: 'live_watch' });
    }
  }

  stop() {
    this.offChat?.();
    this.offChat = undefined;
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.pc = null;
  }

  private sendSignal(signal: SignalPayload) {
    this.chat.send({ op: 'live_signal', signal });
  }

  private async ensurePc(): Promise<RTCPeerConnection> {
    if (this.pc) return this.pc;
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.sendSignal({ type: 'ice', candidate: ev.candidate.toJSON() });
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.onRemoteStream?.(stream);
    };
    if (this.role === 'candidate') {
      const stream = this.getLocalStream();
      stream?.getTracks().forEach((track) => {
        try {
          this.pc!.addTrack(track, stream);
        } catch {
          /* ignore duplicate */
        }
      });
    }
    return this.pc;
  }

  private async publishOffer() {
    const pc = await this.ensurePc();
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    this.sendSignal({ type: 'offer', sdp: offer.sdp! });
  }

  private async onWsMessage(msg: Record<string, unknown>) {
    const type = msg.type as string | undefined;
    if (type === 'live_watch_request' && this.role === 'candidate') {
      await this.publishOffer();
      return;
    }
    if (type !== 'live_signal') return;
    const from = msg.from as string | undefined;
    if (from === this.role) return;
    const signal = msg.signal as SignalPayload | undefined;
    if (!signal) return;

    const pc = await this.ensurePc();

    if (signal.type === 'offer' && this.role === 'proctor') {
      const offerCollision = pc.signalingState !== 'stable';
      const ignore = !this.polite && offerCollision;
      if (ignore) return;
      if (offerCollision) {
        await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({ type: 'answer', sdp: answer.sdp! });
      return;
    }

    if (signal.type === 'answer' && this.role === 'candidate') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      }
      return;
    }

    if (signal.type === 'ice' && signal.candidate) {
      try {
        await pc.addIceCandidate(signal.candidate);
      } catch {
        /* ignore late ICE */
      }
    }
  }
}
