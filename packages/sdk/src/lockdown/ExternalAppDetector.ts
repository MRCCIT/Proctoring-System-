/** Placeholder — real detection requires native agent or extension */
export class ExternalAppDetector {
  async scan(): Promise<{ suspicious: boolean; details: string[] }> {
    return { suspicious: false, details: [] };
  }
}
