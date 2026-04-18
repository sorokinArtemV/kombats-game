import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gameKeys } from '@/app/query-client';
import * as characterApi from '@/transport/http/endpoints/character';
import { usePlayerStore } from './store';
import type { AllocateStatsResponse, ApiError, CharacterResponse } from '@/types/api';

export type StatKey = 'strength' | 'agility' | 'intuition' | 'vitality';

export const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  agility: 'Agility',
  intuition: 'Intuition',
  vitality: 'Vitality',
};

export const STAT_KEYS: readonly StatKey[] = [
  'strength',
  'agility',
  'intuition',
  'vitality',
];

const ZERO_ALLOCATION: Record<StatKey, number> = {
  strength: 0,
  agility: 0,
  intuition: 0,
  vitality: 0,
};

interface UseAllocateStatsOptions {
  /**
   * Called after a successful server response and local character update.
   * Receives the server response so callers can perform post-allocation
   * side-effects (e.g., onboarding screen flipping `onboardingState`,
   * lobby panel clearing `pendingLevelUpLevel`).
   */
  onSuccess?: (response: AllocateStatsResponse) => void;
  /**
   * Called after server error handling. Receives the error so the caller
   * can decide whether to emit a toast, navigate away, etc. 409 revision
   * mismatches are already handled internally (refetch + reset).
   */
  onError?: (error: ApiError | undefined) => void;
}

export interface UseAllocateStatsResult {
  added: Record<StatKey, number>;
  totalAdded: number;
  remaining: number;
  unspentPoints: number;
  canIncrement: boolean;
  canDecrementStat: (stat: StatKey) => boolean;
  increment: (stat: StatKey) => void;
  decrement: (stat: StatKey) => void;
  reset: () => void;
  submit: () => void;
  isPending: boolean;
  errorMessage: string | null;
}

/**
 * Encapsulates the shared mechanics of stat-point allocation:
 *   - `added` local draft + increment/decrement/reset
 *   - `useMutation` wrapping `POST /api/v1/character/stats`
 *   - common success path (merge stats into character, invalidate game state)
 *   - common 409 handling (refetch game state, zero the draft)
 *   - human-readable error extraction
 *
 * The onboarding initial-allocation screen and the post-level-up lobby
 * panel call it with different `onSuccess` hooks for their divergent
 * side-effects — everything else is shared.
 */
export function useAllocateStats(
  options?: UseAllocateStatsOptions,
): UseAllocateStatsResult {
  const character = usePlayerStore((s) => s.character);
  const updateCharacter = usePlayerStore((s) => s.updateCharacter);
  const queryClient = useQueryClient();

  const [added, setAdded] = useState<Record<StatKey, number>>({
    ...ZERO_ALLOCATION,
  });

  const unspentPoints = character?.unspentPoints ?? 0;
  const totalAdded =
    added.strength + added.agility + added.intuition + added.vitality;
  const remaining = unspentPoints - totalAdded;

  const mutation = useMutation({
    mutationFn: () =>
      characterApi.allocateStats({
        expectedRevision: character?.revision ?? 0,
        strength: added.strength,
        agility: added.agility,
        intuition: added.intuition,
        vitality: added.vitality,
      }),
    onSuccess: (response) => {
      if (character) {
        const next: CharacterResponse = {
          ...character,
          strength: response.strength,
          agility: response.agility,
          intuition: response.intuition,
          vitality: response.vitality,
          unspentPoints: response.unspentPoints,
          revision: response.revision,
        };
        updateCharacter(next);
      }
      setAdded({ ...ZERO_ALLOCATION });
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
      options?.onSuccess?.(response);
    },
    onError: async (error) => {
      const err = error as ApiError | undefined;
      // Revision mismatch — refetch and clear the draft so the user can
      // retry with fresh numbers. Never let the server think we are
      // replaying stale adjustments.
      if (err?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: gameKeys.state() });
        setAdded({ ...ZERO_ALLOCATION });
      }
      options?.onError?.(err);
    },
  });

  function increment(stat: StatKey): void {
    if (remaining <= 0) return;
    setAdded((prev) => ({ ...prev, [stat]: prev[stat] + 1 }));
  }

  function decrement(stat: StatKey): void {
    if (added[stat] <= 0) return;
    setAdded((prev) => ({ ...prev, [stat]: prev[stat] - 1 }));
  }

  function reset(): void {
    setAdded({ ...ZERO_ALLOCATION });
  }

  function submit(): void {
    if (totalAdded === 0) return;
    mutation.mutate();
  }

  function canDecrementStat(stat: StatKey): boolean {
    return added[stat] > 0;
  }

  let errorMessage: string | null = null;
  if (mutation.isError) {
    const err = mutation.error as ApiError | undefined;
    if (!err?.error) {
      errorMessage = 'An unexpected error occurred.';
    } else if (err.status === 409) {
      errorMessage =
        'Character was updated elsewhere. Points have been reset — please try again.';
    } else {
      errorMessage = err.error.message;
    }
  }

  return {
    added,
    totalAdded,
    remaining,
    unspentPoints,
    canIncrement: remaining > 0,
    canDecrementStat,
    increment,
    decrement,
    reset,
    submit,
    isPending: mutation.isPending,
    errorMessage,
  };
}
