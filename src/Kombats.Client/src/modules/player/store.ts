import { create } from 'zustand';
import type {
  CharacterResponse,
  QueueStatusResponse,
  GameStateResponse,
} from '@/types/api';

interface PlayerState {
  character: CharacterResponse | null;
  queueStatus: QueueStatusResponse | null;
  isCharacterCreated: boolean;
  degradedServices: string[] | null;
  isLoaded: boolean;

  /**
   * Set when the player finishes a battle and is returning to the lobby.
   * Consumed by `usePostBattleRefresh` on the next lobby mount to trigger
   * the DEC-5 XP/level re-fetch sequence. Non-persistent; in-memory only.
   */
  postBattleRefreshNeeded: boolean;

  /**
   * Level reached on the most recent post-battle refresh where a level-up
   * was detected. Surfaced by the lobby level-up banner; cleared when the
   * player dismisses the banner or allocates stats.
   */
  pendingLevelUpLevel: number | null;

  setGameState: (response: GameStateResponse) => void;
  setQueueStatus: (queueStatus: QueueStatusResponse | null) => void;
  updateCharacter: (character: CharacterResponse) => void;
  setPostBattleRefreshNeeded: (needed: boolean) => void;
  setPendingLevelUpLevel: (level: number | null) => void;
  clearState: () => void;
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  character: null,
  queueStatus: null,
  isCharacterCreated: false,
  degradedServices: null,
  isLoaded: false,
  postBattleRefreshNeeded: false,
  pendingLevelUpLevel: null,

  setGameState: (response) =>
    set({
      character: response.character,
      queueStatus: response.queueStatus,
      isCharacterCreated: response.isCharacterCreated,
      degradedServices: response.degradedServices,
      isLoaded: true,
    }),

  setQueueStatus: (queueStatus) => set({ queueStatus }),

  updateCharacter: (character) => set({ character }),

  setPostBattleRefreshNeeded: (needed) => set({ postBattleRefreshNeeded: needed }),

  setPendingLevelUpLevel: (level) => set({ pendingLevelUpLevel: level }),

  clearState: () =>
    set({
      character: null,
      queueStatus: null,
      isCharacterCreated: false,
      degradedServices: null,
      isLoaded: false,
      postBattleRefreshNeeded: false,
      pendingLevelUpLevel: null,
    }),
}));
