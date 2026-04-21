import type { BattleFeedEntry } from '@/types/battle';

/**
 * Sentinel `turnIndex` the backend assigns to end-of-battle entries so they
 * sort after every real turn (see `NarrationPipeline.GenerateBattleEndFeed`
 * in `Kombats.Bff.Application`). It is an ordering key, not a user-visible
 * turn number — presentation must not render it as "T2147483647".
 */
export const END_OF_BATTLE_TURN_INDEX = 2147483647;

/**
 * Merge two battle-feed sources into a single deduplicated, ordered list.
 *
 * - Dedup by `entry.key` (server guarantees `{battleId}:{turnIndex}:{sequence}`).
 * - Authoritative/HTTP entries overwrite store/live entries with the same key.
 * - Sorted by `turnIndex`, then `sequence`.
 *
 * Pure function — no React, no transport, no store. Lives outside
 * `result-feed.ts` (which pulls in transport/config) so it can be unit
 * tested in isolation.
 */
export function mergeFeeds(
  store: readonly BattleFeedEntry[],
  authoritative: readonly BattleFeedEntry[],
): BattleFeedEntry[] {
  const byKey = new Map<string, BattleFeedEntry>();
  for (const entry of store) byKey.set(entry.key, entry);
  for (const entry of authoritative) byKey.set(entry.key, entry);
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.turnIndex !== b.turnIndex) return a.turnIndex - b.turnIndex;
    return a.sequence - b.sequence;
  });
}
