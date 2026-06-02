interface ChatMessage {
    id?: number;
    sender_type?: 'candidate' | 'proctor' | 'system';
    message?: string;
    type?: string;
    created_at?: string;
}
interface ProctorChatClientOptions {
    wsUrl: string;
    /** ws_token from /sdk/sessions/init OR `bearer` query for proctor */
    token?: string;
    /** Fallback to tenant API key over `x-api-key` query */
    apiKey?: string;
    /** True for tenant-admin proctor connections (uses bearer= query) */
    asProctor?: boolean;
}
/**
 * Slim WebSocket client. Used by candidate (with ws_token) and by tenant-admin
 * proctor live view (with admin JWT) to chat, receive status updates,
 * pause/resume notifications, and proctor commands.
 */
declare class ProctorChatClient {
    private readonly opts;
    private ws;
    private reconnectTimer;
    private listeners;
    private opened;
    private destroyed;
    constructor(opts: ProctorChatClientOptions);
    connect(): void;
    private scheduleReconnect;
    on(fn: (msg: Record<string, unknown>) => void): () => boolean;
    private emit;
    send(payload: Record<string, unknown>): boolean;
    sendChat(message: string): boolean;
    ping(): boolean;
    syncTimer(): boolean;
    pollStatus(): boolean;
    close(): void;
}

export { type ChatMessage as C, ProctorChatClient as P, type ProctorChatClientOptions as a };
