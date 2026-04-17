import { clsx } from 'clsx';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-bg-surface text-text-secondary',
  accent: 'bg-accent text-text-primary',
  success: 'bg-success text-text-primary',
  warning: 'bg-warning text-bg-primary',
  error: 'bg-error text-text-primary',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
