import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router';
import { clsx } from 'clsx';
import { useBattleStore } from '../store';
import { useBattlePhase, useBattleResult } from '../hooks';
import { useAuthStore } from '@/modules/auth/store';
import { deriveOutcome } from '../battle-end-outcome';
import { outcomeAccentClass } from '../outcome-tone';

export function BattleEndOverlay() {
  const phase = useBattlePhase();
  const { endReason, winnerPlayerId } = useBattleResult();
  const battleId = useBattleStore((s) => s.battleId);
  const myId = useAuthStore((s) => s.userIdentityId);

  const open = phase === 'Ended';
  if (!open || !battleId) return null;

  const { outcome, title, subtitle } = deriveOutcome(endReason, winnerPlayerId, myId);

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg-overlay" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-secondary p-6 shadow-xl outline-none"
          aria-describedby={undefined}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <Dialog.Title
              className={clsx(
                'font-display text-3xl font-bold uppercase tracking-[0.2em]',
                outcomeAccentClass(outcome),
              )}
            >
              {title.replace(/!$/, '')}
            </Dialog.Title>
            <p className="text-sm text-text-secondary">{subtitle}</p>
            {endReason &&
              outcome === 'other' &&
              endReason !== 'Unknown' && (
                <p className="font-mono text-xs text-text-muted">Reason: {endReason}</p>
              )}
            <Link
              to={`/battle/${battleId}/result`}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              View Result
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
