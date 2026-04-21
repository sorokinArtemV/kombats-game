import { usePlayerStore } from '../store';
import {
  useAllocateStats,
  STAT_KEYS,
  STAT_LABELS,
} from '../useAllocateStats';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { StatPointAllocator } from '@/ui/components/StatPointAllocator';

/**
 * Post-level-up stat allocation from the lobby. Renders nothing when the
 * character has no unspent points. Shares the `useAllocateStats` hook
 * with the onboarding initial-allocation screen; diverges only in the
 * panel chrome (Card wrapper, collapsed header + Reset button) and the
 * `pendingLevelUpLevel` reset on successful drain to zero.
 */
export function StatAllocationPanel() {
  const character = usePlayerStore((s) => s.character);
  const setPendingLevelUpLevel = usePlayerStore((s) => s.setPendingLevelUpLevel);

  const alloc = useAllocateStats({
    onSuccess: (response) => {
      if (response.unspentPoints === 0) {
        setPendingLevelUpLevel(null);
      }
    },
  });

  if (!character || alloc.unspentPoints <= 0) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alloc.submit();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-text-primary">
            Allocate Stat Points
          </h3>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
            {alloc.unspentPoints} available
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {STAT_KEYS.map((stat) => (
            <StatPointAllocator
              key={stat}
              label={STAT_LABELS[stat]}
              baseValue={character[stat]}
              addedPoints={alloc.added[stat]}
              onIncrement={() => alloc.increment(stat)}
              onDecrement={() => alloc.decrement(stat)}
              canIncrement={alloc.canIncrement}
              canDecrement={alloc.canDecrementStat(stat)}
              disabled={alloc.isPending}
            />
          ))}
        </div>

        <p className="text-center text-sm font-medium text-text-secondary">
          Points remaining: <span className="text-accent">{alloc.remaining}</span>
        </p>

        {alloc.errorMessage && (
          <p className="text-center text-sm text-error">{alloc.errorMessage}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={alloc.reset}
            disabled={alloc.isPending || alloc.totalAdded === 0}
          >
            Reset
          </Button>
          <Button
            type="submit"
            loading={alloc.isPending}
            disabled={alloc.totalAdded === 0}
          >
            Confirm
          </Button>
        </div>
      </form>
    </Card>
  );
}
