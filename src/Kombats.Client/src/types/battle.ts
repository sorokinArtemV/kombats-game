import type { Uuid, DateTimeOffset } from './common';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type BattleZone = 'Head' | 'Chest' | 'Belly' | 'Waist' | 'Legs';

export type BattlePhaseRealtime = 'ArenaOpen' | 'TurnOpen' | 'Resolving' | 'Ended';

export type BattleEndReasonRealtime =
  | 'Normal'
  | 'DoubleForfeit'
  | 'Timeout'
  | 'Cancelled'
  | 'AdminForced'
  | 'SystemError'
  | 'Unknown';

export type AttackOutcomeRealtime =
  | 'NoAction'
  | 'Dodged'
  | 'Blocked'
  | 'Hit'
  | 'CriticalHit'
  | 'CriticalBypassBlock'
  | 'CriticalHybridBlocked';

// ---------------------------------------------------------------------------
// Feed enums
// ---------------------------------------------------------------------------

export type FeedEntryKind =
  | 'AttackHit'
  | 'AttackCrit'
  | 'AttackDodge'
  | 'AttackBlock'
  | 'AttackNoAction'
  | 'BattleStart'
  | 'BattleEndVictory'
  | 'BattleEndDraw'
  | 'BattleEndForfeit'
  | 'DefeatKnockout'
  | 'CommentaryFirstBlood'
  | 'CommentaryMutualMiss'
  | 'CommentaryStalemate'
  | 'CommentaryNearDeath'
  | 'CommentaryBigHit'
  | 'CommentaryKnockout'
  | 'CommentaryDraw';

export type FeedEntrySeverity = 'Normal' | 'Important' | 'Critical';

export type FeedEntryTone =
  | 'Neutral'
  | 'Aggressive'
  | 'Defensive'
  | 'Dramatic'
  | 'System'
  | 'Flavor';

// ---------------------------------------------------------------------------
// Realtime event payloads
// ---------------------------------------------------------------------------

export interface BattleRulesetRealtime {
  turnSeconds: number;
  noActionLimit: number | null;
}

export interface BattleSnapshotRealtime {
  battleId: Uuid;
  playerAId: Uuid;
  playerBId: Uuid;
  ruleset: BattleRulesetRealtime;
  phase: BattlePhaseRealtime;
  turnIndex: number;
  deadlineUtc: DateTimeOffset;
  noActionStreakBoth: number;
  lastResolvedTurnIndex: number;
  endedReason: BattleEndReasonRealtime | null;
  version: number;
  playerAHp: number | null;
  playerBHp: number | null;
  playerAName: string | null;
  playerBName: string | null;
  playerAMaxHp: number | null;
  playerBMaxHp: number | null;
}

export interface BattleReadyRealtime {
  battleId: Uuid;
  playerAId: Uuid;
  playerBId: Uuid;
  playerAName: string | null;
  playerBName: string | null;
}

export interface TurnOpenedRealtime {
  battleId: Uuid;
  turnIndex: number;
  deadlineUtc: DateTimeOffset;
}

export interface PlayerDamagedRealtime {
  battleId: Uuid;
  playerId: Uuid;
  damage: number;
  remainingHp: number;
  turnIndex: number;
}

export interface AttackResolutionRealtime {
  attackerId: Uuid;
  defenderId: Uuid;
  turnIndex: number;
  attackZone: string | null;
  defenderBlockPrimary: string | null;
  defenderBlockSecondary: string | null;
  wasBlocked: boolean;
  wasCrit: boolean;
  outcome: AttackOutcomeRealtime;
  damage: number;
}

export interface TurnResolutionLogRealtime {
  battleId: Uuid;
  turnIndex: number;
  aToB: AttackResolutionRealtime;
  bToA: AttackResolutionRealtime;
}

export interface TurnResolvedRealtime {
  battleId: Uuid;
  turnIndex: number;
  playerAAction: string;
  playerBAction: string;
  log: TurnResolutionLogRealtime | null;
}

export interface BattleStateUpdatedRealtime {
  battleId: Uuid;
  playerAId: Uuid;
  playerBId: Uuid;
  ruleset: BattleRulesetRealtime;
  phase: BattlePhaseRealtime;
  turnIndex: number;
  deadlineUtc: DateTimeOffset;
  noActionStreakBoth: number;
  lastResolvedTurnIndex: number;
  endedReason: BattleEndReasonRealtime | null;
  version: number;
  playerAHp: number | null;
  playerBHp: number | null;
  playerAName: string | null;
  playerBName: string | null;
  playerAMaxHp: number | null;
  playerBMaxHp: number | null;
}

export interface BattleEndedRealtime {
  battleId: Uuid;
  reason: BattleEndReasonRealtime;
  winnerPlayerId: Uuid | null;
  endedAt: DateTimeOffset;
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export interface BattleFeedEntry {
  key: string;
  battleId: Uuid;
  turnIndex: number;
  sequence: number;
  kind: FeedEntryKind;
  severity: FeedEntrySeverity;
  tone: FeedEntryTone;
  text: string;
}

export interface BattleFeedUpdate {
  battleId: Uuid;
  entries: BattleFeedEntry[];
}

export interface BattleFeedResponse {
  battleId: Uuid;
  entries: BattleFeedEntry[];
}
