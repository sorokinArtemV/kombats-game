# Skill: Add UI Primitive

Create a reusable, stateless UI component in the shared `ui/` layer.

---

## When to Use

When a visual element is needed by multiple modules or represents a fundamental building block (buttons, inputs, cards, indicators, etc.).

---

## Steps

### 1. Create Component

```typescript
// src/ui/components/{ComponentName}.tsx
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '@/ui/utils'; // clsx + tailwind-merge wrapper

interface {ComponentName}Props extends ComponentPropsWithoutRef<'div'> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  // ... component-specific props
}

export const {ComponentName} = forwardRef<HTMLDivElement, {ComponentName}Props>(
  function {ComponentName}({ variant = 'primary', size = 'md', className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          'rounded-[var(--radius-md)]',
          // Variant styles
          variant === 'primary' && 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]',
          variant === 'secondary' && 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
          // Size styles
          size === 'sm' && 'px-[var(--space-sm)] py-[var(--space-xs)] text-sm',
          size === 'md' && 'px-[var(--space-md)] py-[var(--space-sm)] text-base',
          size === 'lg' && 'px-[var(--space-lg)] py-[var(--space-md)] text-lg',
          // Consumer className override
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
```

### 2. Component Rules

- **Stateless**: no Zustand, no TanStack Query, no transport imports
- **Theme-driven**: all visual values via CSS variable tokens
- **Composable**: accept `children`, forward `ref`, spread remaining props
- **Overridable**: accept and merge `className` prop via `cn()` utility
- **Typed**: explicit props interface, no `any`, no `React.FC`
- **Named export**: `export const ComponentName` or `export function ComponentName`
- **Accessible**: use semantic HTML, ARIA attributes, keyboard interaction where applicable

### 3. Use Radix UI for Interactive Primitives

For components that need complex accessibility (dialogs, tooltips, dropdowns, tabs):

```typescript
// src/ui/components/Dialog.tsx
import * as RadixDialog from '@radix-ui/react-dialog';
import { cn } from '@/ui/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
        <RadixDialog.Content className={cn(
          'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'bg-[var(--color-bg-surface)] rounded-[var(--radius-lg)] p-[var(--space-lg)]',
          'shadow-xl',
        )}>
          <RadixDialog.Title className="font-[var(--font-display)] text-lg">
            {title}
          </RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

### 4. Create `cn()` Utility (if Not Yet Created)

```typescript
// src/ui/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 5. Game-Specific Primitives

Some UI primitives are game-specific but still stateless:

```typescript
// ProgressBar for HP display
export function ProgressBar({ value, max, color, className }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('h-3 rounded-full bg-[var(--color-bg-secondary)]', className)}>
      <div
        className="h-full rounded-full transition-all duration-[var(--duration-normal)]"
        style={{
          width: `${percentage}%`,
          backgroundColor: `var(${color})`,
        }}
      />
    </div>
  );
}

// ConnectionIndicator for SignalR status
export function ConnectionIndicator({ status, className }: ConnectionIndicatorProps) {
  const statusColor = {
    connected: 'bg-[var(--color-success)]',
    connecting: 'bg-[var(--color-warning)]',
    reconnecting: 'bg-[var(--color-warning)] animate-pulse',
    disconnected: 'bg-[var(--color-error)]',
  }[status];

  return (
    <div className={cn('size-2 rounded-full', statusColor, className)} />
  );
}
```

---

## Do NOT Create UI Primitives For

- One-off layouts specific to a single screen → use feature components in the module
- Components that need store data → those are feature components, not UI primitives
- Wrappers around single HTML elements with no added behavior → just use the element
- Components that already exist in the design system (`design/src/app/components/ui/`) — reference the pattern but implement for `src/ui/` independently (do not import from `design/`)

---

## Checklist

- [ ] Component in `ui/components/{ComponentName}.tsx`
- [ ] Named export
- [ ] No imports from `modules/`, `transport/`, `app/`
- [ ] No Zustand, TanStack Query, or fetch calls
- [ ] All colors/spacing via CSS variable tokens
- [ ] `className` prop accepted and merged via `cn()`
- [ ] `ref` forwarded (if wrapping a single DOM element)
- [ ] Remaining props spread (`...props`)
- [ ] Radix UI used for complex interactive components
- [ ] Semantic HTML and ARIA attributes
- [ ] No `React.FC`, no default exports, no `any`
