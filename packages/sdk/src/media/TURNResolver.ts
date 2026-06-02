import type { ProctorShieldClient } from '../core/ProctorShieldClient';

export class TURNResolver {
  constructor(private readonly client: ProctorShieldClient) {}
  async resolve() {
    const res = await this.client.getTurnCredentials();
    return (res as { data?: { ice_servers?: RTCIceServer[] } }).data;
  }
}
