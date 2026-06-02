export class ApiKeyValidator {
  static looksLikeKey(key: string): boolean {
    return typeof key === 'string' && key.startsWith('psk_') && key.length > 20;
  }
}
