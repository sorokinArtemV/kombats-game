import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg-overlay/60" />
        <Dialog.Content
          className={clsx(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-bg-primary shadow-lg outline-none',
            className,
          )}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-bg-surface px-4 py-3">
              <Dialog.Title className="text-sm font-medium text-text-primary">
                {title}
              </Dialog.Title>
              <Dialog.Close className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary">
                <span aria-hidden>&#x2715;</span>
              </Dialog.Close>
            </div>
          )}
          <div className="flex-1 overflow-hidden">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
