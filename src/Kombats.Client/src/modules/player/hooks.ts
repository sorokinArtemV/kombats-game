import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { gameKeys, playerKeys } from '@/app/query-client';
import * as gameApi from '@/transport/http/endpoints/game';
import * as playersApi from '@/transport/http/endpoints/players';
import { usePlayerStore } from './store';

export function useGameState() {
  const setGameState = usePlayerStore((s) => s.setGameState);

  const query = useQuery({
    queryKey: gameKeys.state(),
    queryFn: gameApi.getState,
    staleTime: 0,
  });

  useEffect(() => {
    if (query.data) {
      setGameState(query.data);
    }
  }, [query.data, setGameState]);

  return query;
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
