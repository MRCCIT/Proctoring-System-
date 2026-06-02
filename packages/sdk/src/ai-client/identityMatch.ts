/**
 * ArcFace sidecar returns `similarity` on a 0–100 scale (cosine × 100).
 * Older SDK code used 0.55 thinking it was 0–1, which let almost anyone pass.
 */
export const DEFAULT_IDENTITY_MIN_SIMILARITY = 62;

export interface FaceCompareLike {
  verified?: boolean;
  similarity?: number;
  similarity_score?: number;
}

/** Normalize threshold: accept 0.55 (0–1) or 55 (0–100). */
export function normalizeMinSimilarity(threshold: number): number {
  if (threshold > 1 && threshold <= 100) return threshold;
  if (threshold > 0 && threshold <= 1) return threshold * 100;
  return DEFAULT_IDENTITY_MIN_SIMILARITY;
}

/** Map API similarity to 0–100 (ArcFace returns similarity on 0–100; similarity_score may be 0–1). */
export function similarityPercent(data: FaceCompareLike | undefined): number | null {
  if (!data) return null;
  const raw = data.similarity ?? data.similarity_score;
  const sim = Number(raw);
  if (!Number.isFinite(sim)) return null;
  return sim <= 1 ? sim * 100 : sim;
}

export function isIdentityVerified(
  data: FaceCompareLike | undefined,
  minSimilarity: number = DEFAULT_IDENTITY_MIN_SIMILARITY
): boolean {
  if (!data) return false;
  const min = normalizeMinSimilarity(minSimilarity);
  const pct = similarityPercent(data);
  if (pct == null) return false;
  if (pct < min) return false;
  if (data.verified === false) return false;
  return true;
}
