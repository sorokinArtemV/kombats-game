import { clsx } from 'clsx';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-bg-surface font-medium text-text-secondary',
        sizeClasses[size],
        className,
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
