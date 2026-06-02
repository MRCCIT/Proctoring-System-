export class GazeEstimator {
  estimate(_landmarks?: unknown): { direction: string; away: boolean } {
    return { direction: 'center', away: false };
  }
}
