import { create } from 'zustand';
import type { Uuid } from '@/types/common';
import type { MatchState } from '@/types/api';

type MatchmakingStatus = 'idle' | 'searching' | 'matched' | 'battleTransition';

interface MatchmakingState {
  status: MatchmakingStatus;
  matchId: Uuid | null;
  battleId: Uuid | null;
  matchState: MatchState | null;
  searchStartedAt: number | null;
  consecutiveFailures: number;

  setSearching: () => void;
  updateFromPoll: (status: string, matchId: Uuid | null, battleId: Uuid | null, matchState: MatchState | null) => void;
  setBattleTransition: (battleId: Uuid) => void;
  setIdle: () => void;
  hydrateFromServer: (serverStatus: string, matchId: Uuid | null, battleId: Uuid | null, matchState: MatchState | null) => void;
  incrementFailures: () => void;
  resetFailures: () => void;
}

export const useMatchmakingStore = create<MatchmakingState>()((set) => ({
  status: 'idle',
  matchId: null,
  battleId: null,
  matchState: null,
  searchStartedAt: null,
  consecutiveFailures: 0,

  setSearching: () =>
    set({
      status: 'searching',
      matchId: null,
      battleId: null,
      matchState: null,
      searchStartedAt: Date.now(),
      consecutiveFailures: 0,
    }),

  updateFromPoll: (status, matchId, battleId, matchState) => {
    if (status === 'Matched' && battleId) {
      set({
        status: 'battleTransition',
        matchId,
        battleId,
        matchState,
      });
    } else if (status === 'Matched') {
      set({
        status: 'matched',
        matchId,
        battleId: null,
        matchState,
      });
    } else if (status === 'Idle' || status === 'NotQueued') {
      set({
        status: 'idle',
        matchId: null,
        battleId: null,
        matchState: null,
        searchStartedAt: null,
      });
    }
  },

  setBattleTransition: (battleId) =>
    set({
      status: 'battleTransition',
      battleId,
    }),

  setIdle: () =>
    set({
      status: 'idle',
      matchId: null,
      battleId: null,
      matchState: null,
      searchStartedAt: null,
      consecutiveFailures: 0,
    }),

  hydrateFromServer: (serverStatus, matchId, battleId, matchState) => {
    if (serverStatus === 'Searching') {
      set({
        status: 'searching',
        matchId: null,
        battleId: null,
        matchState: null,
        searchStartedAt: Date.now(),
        consecutiveFailures: 0,
      });
    } else if (serverStatus === 'Matched' && !battleId) {
      set({
        status: 'matched',
        matchId,
        battleId: null,
        matchState,
        searchStartedAt: Date.now(),
        consecutiveFailures: 0,
      });
    }
  },

  incrementFailures: () =>
    set((state) => ({ consecutiveFailures: state.consecutiveFailures + 1 })),

  resetFailures: () => set({ consecutiveFailures: 0 }),
}));
