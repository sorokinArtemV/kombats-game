import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gameKeys } from '@/app/query-client';
import * as characterApi from '@/transport/http/endpoints/character';
import { usePlayerStore } from '@/modules/player/store';
import { Button } from '@/ui/components/Button';
import { StatPointAllocator } from '@/ui/components/StatPointAllocator';
import type { ApiError } from '@/types/api';

type StatKey = 'strength' | 'agility' | 'intuition' | 'vitality';

const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  agility: 'Agility',
  intuition: 'Intuition',
  vitality: 'Vitality',
};

const STAT_KEYS: StatKey[] = ['strength', 'agility', 'intuition', 'vitality'];

export function InitialStatsScreen() {
  const character = usePlayerStore((s) => s.character);
  const updateCharacter = usePlayerStore((s) => s.updateCharacter);
  const queryClient = useQueryClient();

  const [added, setAdded] = useState<Record<StatKey, number>>({
    strength: 0,
    agility: 0,
    intuition: 0,
    vitality: 0,
  });

  const unspentPoints = character?.unspentPoints ?? 0;
  const totalAdded = added.strength + added.agility + added.intuition + added.vitality;
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
        updateCharacter({
          ...character,
          strength: response.strength,
          agility: response.agility,
          intuition: response.intuition,
          vitality: response.vitality,
          unspentPoints: response.unspentPoints,
          revision: response.revision,
          onboardingState: 'Ready',
        });
      }
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    },
    onError: async (error) => {
      const err = error as ApiError | undefined;
      // Revision mismatch — refetch game state and let user retry
      if (err?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: gameKeys.state() });
        setAdded({ strength: 0, agility: 0, intuition: 0, vitality: 0 });
      }
    },
  });

  function increment(stat: StatKey) {
    if (remaining <= 0) return;
    setAdded((prev) => ({ ...prev, [stat]: prev[stat] + 1 }));
  }

  function decrement(stat: StatKey) {
    if (added[stat] <= 0) return;
    setAdded((prev) => ({ ...prev, [stat]: prev[stat] - 1 }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalAdded === 0) return;
    mutation.mutate();
  }

  function getErrorMessage(): string | null {
    if (!mutation.isError) return null;
    const err = mutation.error as ApiError | undefined;
    if (!err?.error) return 'An unexpected error occurred.';
    if (err.status === 409) return 'Character was updated elsewhere. Points have been reset — please try again.';
    return err.error.message;
  }

  const errorMessage = getErrorMessage();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl font-bold text-text-primary">Allocate Stats</h2>
        <p className="mt-1 text-sm text-text-muted">
          Spend your initial points across four attributes.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {STAT_KEYS.map((stat) => (
          <StatPointAllocator
            key={stat}
            label={STAT_LABELS[stat]}
            baseValue={character?.[stat] ?? 3}
            addedPoints={added[stat]}
            onIncrement={() => increment(stat)}
            onDecrement={() => decrement(stat)}
            canIncrement={remaining > 0}
            canDecrement={added[stat] > 0}
            disabled={mutation.isPending}
          />
        ))}
      </div>

      <p className="text-center text-sm font-medium text-text-secondary">
        Points remaining: <span className="text-accent">{remaining}</span>
      </p>

      {errorMessage && (
        <p className="text-center text-sm text-error">{errorMessage}</p>
      )}

      <Button type="submit" loading={mutation.isPending} disabled={totalAdded === 0}>
        Confirm Stats
      </Button>
    </form>
  );
}
