interface StatPointAllocatorProps {
  label: string;
  baseValue: number;
  addedPoints: number;
  onIncrement: () => void;
  onDecrement: () => void;
  canIncrement: boolean;
  canDecrement: boolean;
  disabled?: boolean;
}

export function StatPointAllocator({
  label,
  baseValue,
  addedPoints,
  onIncrement,
  onDecrement,
  canIncrement,
  canDecrement,
  disabled = false,
}: StatPointAllocatorProps) {
  const total = baseValue + addedPoints;

  return (
    <div className="flex items-center gap-4 rounded-md border border-bg-surface bg-bg-secondary px-4 py-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {label}
      </span>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled || !canDecrement}
          aria-label={`Decrease ${label}`}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-bg-surface text-base text-text-primary transition-colors hover:bg-accent disabled:opacity-30 disabled:hover:bg-bg-surface"
        >
          −
        </button>
        <span className="inline-flex min-w-[4rem] items-baseline justify-center whitespace-nowrap font-mono text-sm text-text-primary">
          <span>{total}</span>
          {addedPoints > 0 && (
            <span className="ml-1 text-success">+{addedPoints}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled || !canIncrement}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-bg-surface text-base text-text-primary transition-colors hover:bg-accent disabled:opacity-30 disabled:hover:bg-bg-surface"
        >
          +
        </button>
      </div>
    </div>
  );
}
