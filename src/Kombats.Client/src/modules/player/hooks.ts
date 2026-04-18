import { useQuery } from '@tanstack/react-query';
import { gameKeys, playerKeys } from '@/app/query-client';
import * as gameApi from '@/transport/http/endpoints/game';
import * as playersApi from '@/transport/http/endpoints/players';
import { usePlayerStore } from './store';

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

export function useGameState() {
  return useQuery({
    queryKey: gameKeys.state(),
    queryFn: async () => {
      // eslint-disable-next-line no-console
      console.log(`${DIAG} useGameState queryFn BEGIN`);
      try {
        const data = await gameApi.getState();
        // eslint-disable-next-line no-console
        console.log(`${DIAG} useGameState queryFn GOT DATA`, {
          hasCharacter: !!data.character,
          onboardingState: data.character?.onboardingState,
          isCharacterCreated: data.isCharacterCreated,
          queueStatus: data.queueStatus,
          degradedServices: data.degradedServices,
        });
        usePlayerStore.getState().setGameState(data);
        // eslint-disable-next-line no-console
        console.log(`${DIAG} useGameState queryFn setGameState DONE`, {
          isLoaded: usePlayerStore.getState().isLoaded,
          character: usePlayerStore.getState().character?.onboardingState ?? null,
        });
        return data;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`${DIAG} useGameState queryFn ERROR`, {
          err: String(err),
        });
        throw err;
      }
    },
    staleTime: 0,
  });
}

export function useCharacter() {
  return usePlayerStore((s) => s.character);
}

export function useQueueStatus() {
  return usePlayerStore((s) => s.queueStatus);
}

export function usePlayerCard(playerId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: playerKeys.card(playerId),
    queryFn: () => playersApi.getCard(playerId),
    enabled: enabled && !!playerId,
    staleTime: 60_000,
  });
}
