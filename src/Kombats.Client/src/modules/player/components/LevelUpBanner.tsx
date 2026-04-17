import { usePlayerStore } from '../store';

export function LevelUpBanner() {
  const level = usePlayerStore((s) => s.pendingLevelUpLevel);
  const setLevel = usePlayerStore((s) => s.setPendingLevelUpLevel);

  if (level === null) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-success bg-success/10 px-4 py-3 text-sm">
      <div className="flex flex-col">
        <span className="font-display text-base text-success">
          Level up! You reached level {level}.
        </span>
        <span className="text-xs text-text-secondary">
          Spend your new stat points below.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setLevel(null)}
        className="rounded-md border border-bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
      >
        Dismiss
      </button>
    </div>
  );
}
