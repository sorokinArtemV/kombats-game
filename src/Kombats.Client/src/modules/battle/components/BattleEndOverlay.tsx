import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router';
import { clsx } from 'clsx';
import { useBattleStore } from '../store';
import { useBattlePhase, useBattleResult } from '../hooks';
import { useAuthStore } from '@/modules/auth/store';
import { deriveOutcome } from '../battle-end-outcome';
import { outcomeAccentClass } from '../outcome-tone';

/**
 * Lightweight overlay shown when the battle ends while the live battle screen
 * is still visible, before the guard routes over to `/battle/:id/result`. The
 * full-fidelity result screen is Step 10; this keeps parity with existing
 * behavior (a centered panel + "View Result" CTA) while matching the new
 * glass-panel visual language.
 */
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border-[0.5px] border-border-subtle bg-glass-dense p-6 shadow-[var(--shadow-panel-lift)] outline-none"
          style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
          aria-describedby={undefined}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <Dialog.Title
              className={clsx(
                'font-display uppercase',
                outcomeAccentClass(outcome),
              )}
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.28em',
                textShadow: 'var(--shadow-title-neutral)',
              }}
            >
              {title.replace(/!$/, '')}
            </Dialog.Title>
            <p
              className="text-text-secondary"
              style={{
                fontSize: 12,
                letterSpacing: '0.12em',
              }}
            >
              {subtitle}
            </p>
            {endReason && outcome === 'other' && endReason !== 'Unknown' && (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Reason: {endReason}
              </p>
            )}
            <Link
              to={`/battle/${battleId}/result`}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-accent-primary px-6 py-2 font-display text-[13px] uppercase tracking-[0.24em] text-text-on-accent transition-colors duration-150 hover:bg-kombats-gold-light"
            >
              View Result
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
