import { type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-text-primary hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent',
  secondary:
    'border border-accent text-accent hover:bg-accent hover:text-text-primary disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-accent',
  danger:
    'bg-error text-text-primary hover:opacity-90 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
