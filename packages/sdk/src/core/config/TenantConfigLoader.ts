export class TenantConfigLoader {
  constructor(private readonly fetchConfig: (sessionId: string) => Promise<unknown>) {}
  async load(sessionId: string) {
    return this.fetchConfig(sessionId);
  }
}

export class FeatureFlagResolver {
  resolve(flags: Record<string, unknown> | undefined, key: string, defaultValue = false): boolean {
    if (!flags) return defaultValue;
    const v = flags[key];
    return Boolean(v);
  }
}
