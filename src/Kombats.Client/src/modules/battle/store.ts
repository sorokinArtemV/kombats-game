import { create } from 'zustand';
import type { ConnectionState } from '@/transport/signalr/connection-state';
import type { Uuid, DateTimeOffset } from '@/types/common';
import type {
  BattleZone,
  BattleEndReasonRealtime,
  BattleRulesetRealtime,
  BattleSnapshotRealtime,
  BattleReadyRealtime,
  TurnOpenedRealtime,
  PlayerDamagedRealtime,
  TurnResolvedRealtime,
  TurnResolutionLogRealtime,
  BattleStateUpdatedRealtime,
  BattleEndedRealtime,
  BattleFeedEntry,
  BattleFeedUpdate,
} from '@/types/battle';

// ---------------------------------------------------------------------------
// Phase model
// ---------------------------------------------------------------------------

export type BattlePhase =
  | 'Idle'
  | 'Connecting'
  | 'WaitingForJoin'
  | 'ArenaOpen'
  | 'TurnOpen'
  | 'Submitted'
  | 'Resolving'
  | 'Ended'
  | 'ConnectionLost'
  | 'Error';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface BattleState {
  // Phase
  phase: BattlePhase;

  // Battle identity
  battleId: Uuid | null;
  playerAId: Uuid | null;
  playerBId: Uuid | null;
  playerAName: string | null;
  playerBName: string | null;
  ruleset: BattleRulesetRealtime | null;

  // Turn
  turnIndex: number;
  deadlineUtc: DateTimeOffset | null;

  // Selections
  selectedAttackZone: BattleZone | null;
  selectedBlockPair: [BattleZone, BattleZone] | null;
  isSubmitting: boolean;

  // HP
  playerAHp: number | null;
  playerBHp: number | null;
  playerAMaxHp: number | null;
  playerBMaxHp: number | null;

  // Result
  endReason: BattleEndReasonRealtime | null;
  winnerPlayerId: Uuid | null;

  // Resolution
  lastResolution: TurnResolvedRealtime | null;

  // Per-turn structured resolution history accumulated across the live
  // battle. Appended in handleTurnResolved (when log is non-null), used by
  // RoundMap to draw the per-round zone grid. Wiped by reset()/startBattle()
  // via INITIAL_STATE.
  turnHistory: TurnResolutionLogRealtime[];

  // Feed
  feedEntries: BattleFeedEntry[];

  // Archived feed of the most recently finished battle. Captured at
  // BattleEnded and kept in sync through the trailing end-of-battle
  // narration entries that arrive immediately after. Survives reset() so
  // the BottomDock can keep the BATTLE LOG tab around once the user
  // returns to /lobby; cleared by the next startBattle() or by
  // clearLastBattleLog() (the user dismissing the tab).
  lastBattleLog: { battleId: Uuid; entries: BattleFeedEntry[] } | null;

  // Archived turn-history snapshot of the most recently finished battle —
  // mirror of lastBattleLog for the RoundMap. Captured at BattleEnded,
  // survives reset() so the BATTLE LOG tab on /lobby can still render the
  // round grid. Cleared by the next startBattle() or by
  // clearLastTurnHistory() (the user dismissing the tab).
  lastTurnHistory: TurnResolutionLogRealtime[] | null;

  // Connection
  connectionState: ConnectionState;

  // Error
  lastError: string | null;

  // Actions
  setConnectionState: (state: ConnectionState) => void;
  startBattle: (battleId: Uuid) => void;
  handleConnected: () => void;
  handleSnapshot: (snapshot: BattleSnapshotRealtime) => void;
  handleBattleReady: (data: BattleReadyRealtime) => void;
  handleTurnOpened: (data: TurnOpenedRealtime) => void;
  handlePlayerDamaged: (data: PlayerDamagedRealtime) => void;
  handleTurnResolved: (data: TurnResolvedRealtime) => void;
  handleStateUpdated: (data: BattleStateUpdatedRealtime) => void;
  handleBattleEnded: (data: BattleEndedRealtime) => void;
  handleFeedUpdated: (data: BattleFeedUpdate) => void;
  handleConnectionLost: () => void;
  handleReconnected: () => void;
  handleError: (message: string) => void;
  selectAttackZone: (zone: BattleZone) => void;
  selectBlockPair: (pair: [BattleZone, BattleZone]) => void;
  setSubmitting: (submitting: boolean) => void;
  clearSelections: () => void;
  clearLastBattleLog: () => void;
  clearLastTurnHistory: () => void;
  reset: () => void;
}

// Upper bound on the live battle feed. Reconnect backfills already dedupe
// by key, but a very long battle would otherwise grow unboundedly. 500 is
// well above a typical fight length and matches the chat buffer cap.
const MAX_FEED_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  phase: 'Idle' as BattlePhase,
  battleId: null,
  playerAId: null,
  playerBId: null,
  playerAName: null,
  playerBName: null,
  ruleset: null,
  turnIndex: 0,
  deadlineUtc: null,
  selectedAttackZone: null,
  selectedBlockPair: null,
  isSubmitting: false,
  playerAHp: null,
  playerBHp: null,
  playerAMaxHp: null,
  playerBMaxHp: null,
  endReason: null,
  winnerPlayerId: null,
  lastResolution: null,
  turnHistory: [] as TurnResolutionLogRealtime[],
  feedEntries: [] as BattleFeedEntry[],
  lastBattleLog: null as { battleId: Uuid; entries: BattleFeedEntry[] } | null,
  lastTurnHistory: null as TurnResolutionLogRealtime[] | null,
  connectionState: 'disconnected' as ConnectionState,
  lastError: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serverPhaseToLocal(
  serverPhase: string,
  currentPhase: BattlePhase,
): BattlePhase {
  switch (serverPhase) {
    case 'ArenaOpen':
      return 'ArenaOpen';
    case 'TurnOpen':
      return currentPhase === 'Submitted' ? 'Submitted' : 'TurnOpen';
    case 'Resolving':
      return 'Resolving';
    case 'Ended':
      return 'Ended';
    default:
      return currentPhase;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBattleStore = create<BattleState>()((set, get) => ({
  ...INITIAL_STATE,

  setConnectionState: (connectionState) => set({ connectionState }),

  startBattle: (battleId) =>
    set({
      ...INITIAL_STATE,
      phase: 'Connecting',
      battleId,
    }),

  handleConnected: () => {
    const state = get();
    if (state.phase === 'Connecting') {
      set({ phase: 'WaitingForJoin' });
    }
  },

  handleSnapshot: (snapshot) =>
    set({
      battleId: snapshot.battleId,
      playerAId: snapshot.playerAId,
      playerBId: snapshot.playerBId,
      playerAName: snapshot.playerAName,
      playerBName: snapshot.playerBName,
      ruleset: snapshot.ruleset,
      turnIndex: snapshot.turnIndex,
      deadlineUtc: snapshot.deadlineUtc,
      playerAHp: snapshot.playerAHp,
      playerBHp: snapshot.playerBHp,
      playerAMaxHp: snapshot.playerAMaxHp,
      playerBMaxHp: snapshot.playerBMaxHp,
      endReason: snapshot.endedReason,
      phase: serverPhaseToLocal(snapshot.phase, get().phase),
      selectedAttackZone: null,
      selectedBlockPair: null,
      isSubmitting: false,
    }),

  handleBattleReady: (data) =>
    set({
      battleId: data.battleId,
      playerAId: data.playerAId,
      playerBId: data.playerBId,
      playerAName: data.playerAName,
      playerBName: data.playerBName,
      phase: 'ArenaOpen',
    }),

  handleTurnOpened: (data) =>
    set({
      turnIndex: data.turnIndex,
      deadlineUtc: data.deadlineUtc,
      phase: 'TurnOpen',
      selectedAttackZone: null,
      selectedBlockPair: null,
      isSubmitting: false,
      lastResolution: null,
    }),

  handlePlayerDamaged: (data) => {
    const state = get();
    if (data.playerId === state.playerAId) {
      set({ playerAHp: data.remainingHp });
    } else if (data.playerId === state.playerBId) {
      set({ playerBHp: data.remainingHp });
    }
  },

  handleTurnResolved: (data) => {
    const state = get();
    // Append to the per-round history only when the structured log is
    // present. NoAction-only turns and any future event with a missing log
    // are skipped — RoundMap draws an empty row for them implicitly by
    // having no entry to render.
    const nextHistory = data.log
      ? [...state.turnHistory, data.log]
      : state.turnHistory;
    set({
      lastResolution: data,
      turnHistory: nextHistory,
      phase: 'Resolving',
    });
  },

  handleStateUpdated: (data) =>
    set({
      playerAId: data.playerAId,
      playerBId: data.playerBId,
      playerAName: data.playerAName,
      playerBName: data.playerBName,
      ruleset: data.ruleset,
      turnIndex: data.turnIndex,
      deadlineUtc: data.deadlineUtc,
      playerAHp: data.playerAHp,
      playerBHp: data.playerBHp,
      playerAMaxHp: data.playerAMaxHp,
      playerBMaxHp: data.playerBMaxHp,
      endReason: data.endedReason,
      phase: serverPhaseToLocal(data.phase, get().phase),
    }),

  handleBattleEnded: (data) => {
    const state = get();
    set({
      // Snapshot the feed for the post-lobby BATTLE LOG tab. The trailing
      // BattleFeedUpdated (battle.end / defeat / commentary entries) arrives
      // AFTER BattleEnded on the wire (see BattleHubRelay.cs), so the
      // snapshot captured here is incomplete on its own — handleFeedUpdated
      // mirrors any subsequent entries into lastBattleLog while battleId is
      // still set.
      lastBattleLog: state.battleId
        ? { battleId: state.battleId, entries: state.feedEntries }
        : state.lastBattleLog,
      // RoundMap snapshot — turn history is fully populated by the time
      // BattleEnded arrives (each turn appended in handleTurnResolved), so
      // unlike lastBattleLog this one needs no follow-up reconciliation.
      lastTurnHistory: state.turnHistory,
      endReason: data.reason,
      winnerPlayerId: data.winnerPlayerId,
      phase: 'Ended',
      // Final turn's per-turn resolution belongs to the live-battle UI
      // only. Leaving it set bleeds into the result screen, where a
      // TurnResultPanel could briefly flash the last turn's attack/block
      // detail underneath the outcome celebration.
      lastResolution: null,
    });
  },

  handleFeedUpdated: (data) => {
    const state = get();
    const existingKeys = new Set(state.feedEntries.map((e) => e.key));
    const newEntries = data.entries.filter((e) => !existingKeys.has(e.key));
    if (newEntries.length === 0) return;
    const merged = [...state.feedEntries, ...newEntries];
    const trimmed =
      merged.length > MAX_FEED_ENTRIES ? merged.slice(-MAX_FEED_ENTRIES) : merged;

    // Keep the archive in sync while it belongs to the current battle so the
    // post-BattleEnded entries (BATTLE END separator, defeat/victory lines,
    // closing commentary) are part of the snapshot the lobby tab reads.
    const archive = state.lastBattleLog;
    const updatedArchive =
      archive && state.battleId && archive.battleId === state.battleId
        ? { battleId: archive.battleId, entries: trimmed }
        : archive;

    set({
      feedEntries: trimmed,
      ...(updatedArchive !== archive ? { lastBattleLog: updatedArchive } : {}),
    });
  },

  handleConnectionLost: () => {
    const state = get();
    if (state.phase !== 'Idle' && state.phase !== 'Ended') {
      set({ phase: 'ConnectionLost' });
    }
  },

  handleReconnected: () => {
    const state = get();
    if (state.phase === 'ConnectionLost') {
      // Will be reconciled by BattleStateUpdated from server after rejoin
      set({ phase: 'WaitingForJoin' });
    }
  },

  handleError: (message) =>
    set({ phase: 'Error', lastError: message }),

  selectAttackZone: (zone) => set({ selectedAttackZone: zone }),

  selectBlockPair: (pair) => set({ selectedBlockPair: pair }),

  setSubmitting: (submitting) => {
    if (submitting) {
      set({ isSubmitting: true, phase: 'Submitted' });
    } else {
      // Only revert to TurnOpen if still in Submitted — don't stomp
      // a Resolving/Ended state that arrived while the invoke was failing.
      const current = get().phase;
      set({
        isSubmitting: false,
        phase: current === 'Submitted' ? 'TurnOpen' : current,
      });
    }
  },

  clearSelections: () =>
    set({
      selectedAttackZone: null,
      selectedBlockPair: null,
    }),

  clearLastBattleLog: () => set({ lastBattleLog: null }),

  clearLastTurnHistory: () => set({ lastTurnHistory: null }),

  // Preserves lastBattleLog and lastTurnHistory so the BATTLE LOG tab can
  // survive the BattleConnectionHost unmount that fires when the user
  // returns to /lobby. Both archives are cleared by the next startBattle
  // (via INITIAL_STATE spread) or by their respective clear actions when
  // the user dismisses the tab.
  reset: () => {
    const state = get();
    set({
      ...INITIAL_STATE,
      lastBattleLog: state.lastBattleLog,
      lastTurnHistory: state.lastTurnHistory,
    });
  },
}));
