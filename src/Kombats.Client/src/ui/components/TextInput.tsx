import { type InputHTMLAttributes, useId } from 'react';
import { clsx } from 'clsx';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label?: string;
  error?: string;
  charCount?: { current: number; max: number };
}

export function TextInput({
  label,
  error,
  charCount,
  className,
  ...props
}: TextInputProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={id}
        className={clsx(
          'rounded-md border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors',
          error ? 'border-error' : 'border-bg-surface focus:border-accent',
          className,
        )}
        {...props}
      />
      <div className="flex justify-between">
        {error ? (
          <p className="text-xs text-error">{error}</p>
        ) : (
          <span />
        )}
        {charCount && (
          <p
            className={clsx(
              'text-xs',
              charCount.current > charCount.max ? 'text-error' : 'text-text-muted',
            )}
          >
            {charCount.current}/{charCount.max}
          </p>
        )}
      </div>
    </div>
  );
}
