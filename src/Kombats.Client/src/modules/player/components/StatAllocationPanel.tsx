import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gameKeys } from '@/app/query-client';
import * as characterApi from '@/transport/http/endpoints/character';
import { usePlayerStore } from '../store';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { StatPointAllocator } from '@/ui/components/StatPointAllocator';
import type { ApiError, CharacterResponse } from '@/types/api';

type StatKey = 'strength' | 'agility' | 'intuition' | 'vitality';

const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  agility: 'Agility',
  intuition: 'Intuition',
  vitality: 'Vitality',
};

const STAT_KEYS: StatKey[] = ['strength', 'agility', 'intuition', 'vitality'];

const ZERO_ALLOCATION: Record<StatKey, number> = {
  strength: 0,
  agility: 0,
  intuition: 0,
  vitality: 0,
};

/**
 * Post-level-up stat allocation from the lobby. Renders nothing when the
 * character has no unspent points. Reuses the same `/api/v1/character/stats`
 * endpoint and revision-tracking pattern as the onboarding initial
 * allocation — behavior diverges only in presentation (collapsible card
 * sitting next to the character summary; 409 resets the draft and refetches
 * game state so the player can try again with fresh numbers).
 */
export function StatAllocationPanel() {
  const character = usePlayerStore((s) => s.character);
  const updateCharacter = usePlayerStore((s) => s.updateCharacter);
  const setPendingLevelUpLevel = usePlayerStore((s) => s.setPendingLevelUpLevel);
  const queryClient = useQueryClient();

  const [added, setAdded] = useState<Record<StatKey, number>>({ ...ZERO_ALLOCATION });

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
        if (response.unspentPoints === 0) {
          setPendingLevelUpLevel(null);
        }
      }
      setAdded({ ...ZERO_ALLOCATION });
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    },
    onError: async (error) => {
      const err = error as ApiError | undefined;
      if (err?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: gameKeys.state() });
        setAdded({ ...ZERO_ALLOCATION });
      }
    },
  });

  if (!character || unspentPoints <= 0) return null;

  function increment(stat: StatKey) {
    if (remaining <= 0) return;
    setAdded((prev) => ({ ...prev, [stat]: prev[stat] + 1 }));
  }

  function decrement(stat: StatKey) {
    if (added[stat] <= 0) return;
    setAdded((prev) => ({ ...prev, [stat]: prev[stat] - 1 }));
  }

  function handleReset() {
    setAdded({ ...ZERO_ALLOCATION });
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
    if (err.status === 409) {
      return 'Character was updated elsewhere. Points have been reset — please try again.';
    }
    return err.error.message;
  }

  const errorMessage = getErrorMessage();

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-text-primary">
            Allocate Stat Points
          </h3>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
            {unspentPoints} available
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {STAT_KEYS.map((stat) => (
            <StatPointAllocator
              key={stat}
              label={STAT_LABELS[stat]}
              baseValue={character[stat]}
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

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            disabled={mutation.isPending || totalAdded === 0}
          >
            Reset
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={totalAdded === 0}
          >
            Confirm
          </Button>
        </div>
      </form>
    </Card>
  );
}
