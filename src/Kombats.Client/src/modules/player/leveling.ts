// Mirrors backend LevelingPolicyV1 triangular progression.
// Formula: cumulativeXp(level) = BASE_FACTOR × level × (level + 1)

const BASE_FACTOR = 50;

/** Total cumulative XP required to reach `level`. */
export function xpToReachLevel(level: number): number {
  return BASE_FACTOR * level * (level + 1);
}

/**
 * Compute XP progress within the current level band.
 * Returns { current, needed } where:
 * - `current` is XP earned within this level band
 * - `needed` is the total XP width of the band (0 if at max or level 0)
 */
export function levelProgress(
  level: number,
  totalXp: number,
): { current: number; needed: number } {
  const currentThreshold = xpToReachLevel(level);
  const nextThreshold = xpToReachLevel(level + 1);
  const bandWidth = nextThreshold - currentThreshold;

  return {
    current: Math.max(0, totalXp - currentThreshold),
    needed: bandWidth,
  };
}
