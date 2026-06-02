import { P as ProctorShieldClient } from '../ProctorShieldClient-DAMa3Xag.cjs';
export { C as ChatMessage, P as ProctorChatClient, a as ProctorChatClientOptions } from '../ProctorChatClient-BaqzF393.cjs';

type SdkEventType = 'session.initialized' | 'violation.detected' | 'identity.verified' | 'stream.started' | 'session.ended';
interface SdkViolationEvent {
    type: string;
    severity: 'info' | 'warn' | 'flag' | 'terminate';
    payload?: Record<string, unknown>;
    occurred_at?: string;
}

type Listener = (payload: unknown) => void;
declare class EventEmitter {
    private listeners;
    on(event: string, fn: Listener): () => void;
    off(event: string, fn: Listener): void;
    emit(event: string, payload: unknown): void;
}

declare class WebhookDispatcher {
    private readonly client;
    constructor(client: ProctorShieldClient);
    dispatchEvents(sessionId: string, events: Record<string, unknown>[]): Promise<unknown>;
}

export { EventEmitter, type SdkEventType, type SdkViolationEvent, WebhookDispatcher };
