import type { ProctorShieldClient } from '../core/ProctorShieldClient';

export class WebhookDispatcher {
  constructor(private readonly client: ProctorShieldClient) {}

  async dispatchEvents(sessionId: string, events: Record<string, unknown>[]) {
    return this.client.postSdkEvents({ session_id: sessionId, events });
  }
}
