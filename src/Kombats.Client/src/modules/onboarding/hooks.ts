import { useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gameKeys } from '@/app/query-client';
import * as gameApi from '@/transport/http/endpoints/game';
import { usePlayerStore } from '@/modules/player/store';

/**
 * Automatically calls POST /api/v1/game/onboard when game state has loaded
 * but no character exists. The call is idempotent. On success, invalidates
 * the game state query so GameStateLoader re-fetches and the player store
 * gets the new Draft character.
 */
export function useAutoOnboard() {
  const isLoaded = usePlayerStore((s) => s.isLoaded);
  const isCharacterCreated = usePlayerStore((s) => s.isCharacterCreated);
  const queryClient = useQueryClient();
  const attemptedRef = useRef(false);

  const { mutate, isPending, isError, error, reset } = useMutation({
    mutationFn: gameApi.onboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    },
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (isCharacterCreated) return;
    if (attemptedRef.current) return;
    if (isPending) return;

    attemptedRef.current = true;
    mutate();
  }, [isLoaded, isCharacterCreated, isPending, mutate]);

  const retry = useCallback(() => {
    reset();
    attemptedRef.current = false;
    mutate();
  }, [mutate, reset]);

  return { isPending, isError, error, retry };
}
