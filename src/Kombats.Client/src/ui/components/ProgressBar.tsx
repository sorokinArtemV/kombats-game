import { clsx } from 'clsx';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showText?: boolean;
  colorClass?: string;
  className?: string;
}

export function ProgressBar({
  value,
  max,
  label,
  showText = false,
  colorClass = 'bg-accent',
  className,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {(label || showText) && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          {label && <span>{label}</span>}
          {showText && (
            <span>
              {value} / {max}
            </span>
          )}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-surface">
        <div
          className={clsx('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
