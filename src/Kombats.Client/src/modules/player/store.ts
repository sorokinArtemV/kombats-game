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

  setGameState: (response: GameStateResponse) => void;
  updateCharacter: (character: CharacterResponse) => void;
  clearState: () => void;
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  character: null,
  queueStatus: null,
  isCharacterCreated: false,
  degradedServices: null,
  isLoaded: false,

  setGameState: (response) =>
    set({
      character: response.character,
      queueStatus: response.queueStatus,
      isCharacterCreated: response.isCharacterCreated,
      degradedServices: response.degradedServices,
      isLoaded: true,
    }),

  updateCharacter: (character) => set({ character }),

  clearState: () =>
    set({
      character: null,
      queueStatus: null,
      isCharacterCreated: false,
      degradedServices: null,
      isLoaded: false,
    }),
}));
