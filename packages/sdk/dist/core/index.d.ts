export { P as ProctorShieldClient } from '../ProctorShieldClient-DAMa3Xag.js';

declare class ApiKeyValidator {
    static looksLikeKey(key: string): boolean;
}

declare class SessionTokenManager {
    private readonly storageKey;
    constructor(storageKey: string);
    get(): string | null;
    set(token: string): void;
    clear(): void;
}

declare class TenantConfigLoader {
    private readonly fetchConfig;
    constructor(fetchConfig: (sessionId: string) => Promise<unknown>);
    load(sessionId: string): Promise<unknown>;
}
declare class FeatureFlagResolver {
    resolve(flags: Record<string, unknown> | undefined, key: string, defaultValue?: boolean): boolean;
}

export { ApiKeyValidator, FeatureFlagResolver, SessionTokenManager, TenantConfigLoader };
