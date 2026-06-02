import type { ProctorShieldClient } from '../core/ProctorShieldClient';

export class CloudInference {
  constructor(private readonly client: ProctorShieldClient) {}
  async analyzeFrame(sessionId: string, imageDataUrl: string, persist = true) {
    return this.client.monitorTickAi(sessionId, imageDataUrl, persist);
  }
}
