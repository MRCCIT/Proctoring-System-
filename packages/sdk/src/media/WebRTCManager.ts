import { TURNResolver } from './TURNResolver';
import type { ProctorShieldClient } from '../core/ProctorShieldClient';

export class WebRTCManager {
  private readonly turn: TURNResolver;
  constructor(private readonly client: ProctorShieldClient) {
    this.turn = new TURNResolver(this.client);
  }

  async createPeerConnection(): Promise<RTCPeerConnection> {
    const turn = await this.turn.resolve();
    const iceServers = turn?.ice_servers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
    return new RTCPeerConnection({ iceServers });
  }
}
