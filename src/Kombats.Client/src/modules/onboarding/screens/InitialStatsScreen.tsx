import { usePlayerStore } from '@/modules/player/store';
import {
  useAllocateStats,
  STAT_KEYS,
  STAT_LABELS,
} from '@/modules/player/useAllocateStats';
import { Button } from '@/ui/components/Button';
import { StatPointAllocator } from '@/ui/components/StatPointAllocator';

export function InitialStatsScreen() {
  const character = usePlayerStore((s) => s.character);
  const updateCharacter = usePlayerStore((s) => s.updateCharacter);

  const alloc = useAllocateStats({
    onSuccess: () => {
      // Onboarding-specific side effect: flip onboardingState to 'Ready'
      // so the OnboardingGuard redirects the user out to /lobby. The hook
      // has already merged the response stats into the character.
      const c = usePlayerStore.getState().character;
      if (c) updateCharacter({ ...c, onboardingState: 'Ready' });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    alloc.submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold text-text-primary">Allocate Stats</h2>
        <p className="text-sm text-text-muted">
          Spend your initial points across four attributes.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {STAT_KEYS.map((stat) => (
          <StatPointAllocator
            key={stat}
            label={STAT_LABELS[stat]}
            baseValue={character?.[stat] ?? 3}
            addedPoints={alloc.added[stat]}
            onIncrement={() => alloc.increment(stat)}
            onDecrement={() => alloc.decrement(stat)}
            canIncrement={alloc.canIncrement}
            canDecrement={alloc.canDecrementStat(stat)}
            disabled={alloc.isPending}
          />
        ))}
      </div>

      <div className="flex items-center justify-between rounded-md bg-bg-secondary px-4 py-3">
        <span className="text-sm font-medium text-text-secondary">Points remaining</span>
        <span className="font-mono text-base font-semibold text-accent">{alloc.remaining}</span>
      </div>

      {alloc.errorMessage && (
        <p className="text-center text-sm text-error">{alloc.errorMessage}</p>
      )}

      <Button
        type="submit"
        loading={alloc.isPending}
        disabled={alloc.totalAdded === 0}
        className="w-full"
      >
        Confirm Stats
      </Button>
    </form>
  );
}
