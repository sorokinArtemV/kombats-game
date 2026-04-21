import { clsx } from 'clsx';
import { useBattlePhase, useBattleActions, useBattleConnectionState } from '../hooks';
import { ALL_ZONES, VALID_BLOCK_PAIRS } from '../zones';
import { Spinner } from '@/ui/components/Spinner';
import type { BattleZone } from '@/types/battle';

const zoneDot: Record<BattleZone, string> = {
  Head: 'bg-zone-head',
  Chest: 'bg-zone-chest',
  Belly: 'bg-zone-belly',
  Waist: 'bg-zone-waist',
  Legs: 'bg-zone-legs',
};

/**
 * Action selection panel — design composition: two columns (red Attack list,
 * blue Block list) with a centered, prominent green GO button below.
 */
export function ZoneSelector() {
  const phase = useBattlePhase();
  const connectionState = useBattleConnectionState();
  const actions = useBattleActions();

  const turnOpen = phase === 'TurnOpen';
  const connectionBlocked = connectionState !== 'connected';
  const disabled = !turnOpen || connectionBlocked;
  const canGo = actions.canSubmit && !connectionBlocked;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-bg-secondary p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-attack">
            Attack
          </p>
          <div className="flex flex-col gap-1.5">
            {ALL_ZONES.map((zone) => (
              <ZoneListButton
                key={zone}
                tone="attack"
                selected={actions.selectedAttackZone === zone}
                disabled={disabled}
                onClick={() => actions.selectAttackZone(zone)}
              >
                <span className={clsx('h-2 w-2 rounded-full', zoneDot[zone])} aria-hidden />
                <span>{zone}</span>
              </ZoneListButton>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-block">
            Block
          </p>
          <div className="flex flex-col gap-1.5">
            {VALID_BLOCK_PAIRS.map((pair) => {
              const selected =
                actions.selectedBlockPair?.[0] === pair[0] &&
                actions.selectedBlockPair?.[1] === pair[1];
              return (
                <ZoneListButton
                  key={`${pair[0]}-${pair[1]}`}
                  tone="block"
                  selected={selected}
                  disabled={disabled}
                  onClick={() => actions.selectBlockPair(pair)}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={clsx('h-1.5 w-1.5 rounded-full', zoneDot[pair[0]])}
                      aria-hidden
                    />
                    <span
                      className={clsx('h-1.5 w-1.5 rounded-full', zoneDot[pair[1]])}
                      aria-hidden
                    />
                  </span>
                  <span className="text-[11px]">{`${pair[0]} + ${pair[1]}`}</span>
                </ZoneListButton>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center pt-1">
        <button
          type="button"
          onClick={actions.submitAction}
          disabled={!canGo}
          className={clsx(
            'inline-flex items-center justify-center gap-2 rounded-md px-12 py-3 font-display text-lg font-bold uppercase tracking-[0.2em] transition-colors',
            canGo
              ? 'bg-go text-white hover:bg-go-hover'
              : 'bg-bg-surface text-text-muted',
          )}
        >
          {actions.isSubmitting && <Spinner size="sm" />}
          GO
        </button>
      </div>

      {connectionBlocked && turnOpen && (
        <p className="text-center text-xs text-warning">
          Waiting for connection before submitting…
        </p>
      )}
    </div>
  );
}

function ZoneListButton({
  tone,
  selected,
  disabled,
  onClick,
  children,
}: {
  tone: 'attack' | 'block';
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  const selectedAttack = 'border-attack bg-attack text-white hover:bg-attack-strong';
  const idleAttack = 'border-attack/60 bg-transparent text-attack hover:bg-attack/10';
  const selectedBlock = 'border-block bg-block text-white hover:bg-block-strong';
  const idleBlock = 'border-block/60 bg-transparent text-block hover:bg-block/10';

  const className = clsx(
    base,
    tone === 'attack'
      ? selected
        ? selectedAttack
        : idleAttack
      : selected
        ? selectedBlock
        : idleBlock,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={className}
    >
      {children}
    </button>
  );
}
