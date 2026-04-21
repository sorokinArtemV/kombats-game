import { useQuery } from '@tanstack/react-query';
import { gameKeys, playerKeys } from '@/app/query-client';
import * as gameApi from '@/transport/http/endpoints/game';
import * as playersApi from '@/transport/http/endpoints/players';
import { usePlayerStore } from './store';

export function useGameState() {
  return useQuery({
    queryKey: gameKeys.state(),
    queryFn: async () => {
      const data = await gameApi.getState();
      usePlayerStore.getState().setGameState(data);
      return data;
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
