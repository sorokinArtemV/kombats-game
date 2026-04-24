import { usePlayerStore } from '@/modules/player/store';
import {
  useAllocateStats,
  STAT_KEYS,
  STAT_LABELS,
} from '@/modules/player/useAllocateStats';
import { Button } from '@/ui/components/Button';
import { StatPointAllocator } from '@/ui/components/StatPointAllocator';
import { OnboardingCard } from '../components/OnboardingCard';

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
    <OnboardingCard
      eyebrow="Onboarding"
      title="Allocate Stats"
      subtitle="Spend your initial points across four attributes"
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
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

        <div className="flex items-center justify-between rounded-sm border-[0.5px] border-border-subtle bg-glass-subtle px-4 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
            Points remaining
          </span>
          <span className="text-sm font-medium tabular-nums text-kombats-gold">
            {alloc.remaining}
          </span>
        </div>

        {alloc.errorMessage && (
          <p className="text-center text-[12px] uppercase tracking-[0.18em] text-kombats-crimson-light">
            {alloc.errorMessage}
          </p>
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
    </OnboardingCard>
  );
}
