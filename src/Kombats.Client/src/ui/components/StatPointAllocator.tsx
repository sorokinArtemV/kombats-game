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
    <div className="flex items-center justify-between rounded-md border border-bg-surface bg-bg-secondary px-4 py-3">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled || !canDecrement}
          className="flex h-7 w-7 items-center justify-center rounded bg-bg-surface text-sm text-text-primary transition-colors hover:bg-accent disabled:opacity-30 disabled:hover:bg-bg-surface"
        >
          −
        </button>
        <span className="w-8 text-center font-mono text-sm text-text-primary">
          {total}
          {addedPoints > 0 && (
            <span className="text-success"> +{addedPoints}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled || !canIncrement}
          className="flex h-7 w-7 items-center justify-center rounded bg-bg-surface text-sm text-text-primary transition-colors hover:bg-accent disabled:opacity-30 disabled:hover:bg-bg-surface"
        >
          +
        </button>
      </div>
    </div>
  );
}
