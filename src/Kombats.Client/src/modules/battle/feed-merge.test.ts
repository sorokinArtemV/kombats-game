import { describe, it, expect } from 'vitest';
import { mergeFeeds } from './feed-merge';
import type {
  BattleFeedEntry,
  FeedEntryKind,
  FeedEntrySeverity,
  FeedEntryTone,
} from '@/types/battle';

const BATTLE_ID = 'battle-1';

function entry(
  turnIndex: number,
  sequence: number,
  text: string,
  overrides: Partial<BattleFeedEntry> = {},
): BattleFeedEntry {
  return {
    key: `${BATTLE_ID}:${turnIndex}:${sequence}`,
    battleId: BATTLE_ID,
    turnIndex,
    sequence,
    kind: 'AttackHit' as FeedEntryKind,
    severity: 'Normal' as FeedEntrySeverity,
    tone: 'Neutral' as FeedEntryTone,
    text,
    ...overrides,
  };
}

describe('mergeFeeds', () => {
  it('returns an empty array when both sources are empty', () => {
    expect(mergeFeeds([], [])).toEqual([]);
  });

  it('passes through a single source unchanged', () => {
    const a = entry(1, 0, 'A');
    const b = entry(1, 1, 'B');
    expect(mergeFeeds([a, b], [])).toEqual([a, b]);
    expect(mergeFeeds([], [a, b])).toEqual([a, b]);
  });

  it('deduplicates by key across sources', () => {
    const live = entry(1, 0, 'live');
    const auth = entry(1, 0, 'auth');
    const merged = mergeFeeds([live], [auth]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('auth');
  });

  it('authoritative (http) entries overwrite store entries with the same key', () => {
    const live = entry(2, 3, 'live-text', { severity: 'Normal' });
    const auth = entry(2, 3, 'auth-text', { severity: 'Critical' });
    const [only] = mergeFeeds([live], [auth]);
    expect(only.text).toBe('auth-text');
    expect(only.severity).toBe('Critical');
  });

  it('orders entries by (turnIndex, sequence) regardless of source order', () => {
    const t1s0 = entry(1, 0, 't1s0');
    const t1s1 = entry(1, 1, 't1s1');
    const t2s0 = entry(2, 0, 't2s0');
    const t2s1 = entry(2, 1, 't2s1');

    const merged = mergeFeeds([t2s1, t1s1], [t2s0, t1s0]);

    expect(merged.map((e) => e.text)).toEqual(['t1s0', 't1s1', 't2s0', 't2s1']);
  });

  it('merges disjoint entries from both sources', () => {
    const liveOnly = entry(1, 0, 'live');
    const authOnly = entry(1, 1, 'auth');
    const merged = mergeFeeds([liveOnly], [authOnly]);
    expect(merged.map((e) => e.text)).toEqual(['live', 'auth']);
  });

  it('produces a stable order when (turnIndex, sequence) are unique', () => {
    const entries = [entry(3, 5, 'x'), entry(1, 0, 'y'), entry(3, 2, 'z')];
    const merged = mergeFeeds(entries, []);
    expect(merged.map((e) => `${e.turnIndex}:${e.sequence}`)).toEqual([
      '1:0',
      '3:2',
      '3:5',
    ]);
  });
});
