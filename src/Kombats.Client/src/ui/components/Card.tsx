import { type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={clsx('rounded-lg border border-bg-surface bg-bg-secondary p-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}
