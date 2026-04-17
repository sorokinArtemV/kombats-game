import { clsx } from 'clsx';
import { useBattlePhase, useBattleActions, useBattleConnectionState } from '../hooks';
import { ALL_ZONES, VALID_BLOCK_PAIRS } from '../zones';
import { Button } from '@/ui/components/Button';
import type { BattleZone } from '@/types/battle';

const zoneColor: Record<BattleZone, string> = {
  Head: 'bg-zone-head',
  Chest: 'bg-zone-chest',
  Belly: 'bg-zone-belly',
  Waist: 'bg-zone-waist',
  Legs: 'bg-zone-legs',
};

export function ZoneSelector() {
  const phase = useBattlePhase();
  const connectionState = useBattleConnectionState();
  const actions = useBattleActions();

  const turnOpen = phase === 'TurnOpen';
  const submitted = phase === 'Submitted';
  const connectionBlocked = connectionState !== 'connected';

  const disabled = !turnOpen || connectionBlocked;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-bg-surface bg-bg-secondary p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-wide text-text-primary">
          Choose Your Move
        </h2>
        {submitted && (
          <span className="rounded-full bg-info/20 px-2 py-0.5 text-xs font-medium text-info">
            Action submitted
          </span>
        )}
      </header>

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-text-muted">Attack zone</p>
        <div className="grid grid-cols-5 gap-2">
          {ALL_ZONES.map((zone) => (
            <AttackZoneButton
              key={zone}
              zone={zone}
              selected={actions.selectedAttackZone === zone}
              disabled={disabled}
              onClick={() => actions.selectAttackZone(zone)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-text-muted">Block pair (adjacent)</p>
        <div className="grid grid-cols-5 gap-2">
          {VALID_BLOCK_PAIRS.map((pair) => {
            const selected =
              actions.selectedBlockPair?.[0] === pair[0] &&
              actions.selectedBlockPair?.[1] === pair[1];
            return (
              <BlockPairButton
                key={`${pair[0]}-${pair[1]}`}
                pair={pair}
                selected={selected}
                disabled={disabled}
                onClick={() => actions.selectBlockPair(pair)}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-bg-surface pt-3">
        <SelectionSummary
          attackZone={actions.selectedAttackZone}
          blockPair={actions.selectedBlockPair}
        />
        <Button
          onClick={actions.submitAction}
          disabled={!actions.canSubmit || connectionBlocked}
          loading={actions.isSubmitting}
        >
          {submitted ? 'Submitted' : 'Submit action'}
        </Button>
      </div>

      {connectionBlocked && turnOpen && (
        <p className="text-xs text-warning">Waiting for connection before submitting…</p>
      )}
    </div>
  );
}

function AttackZoneButton({
  zone,
  selected,
  disabled,
  onClick,
}: {
  zone: BattleZone;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        'flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs font-medium transition-colors',
        selected
          ? 'border-accent bg-accent/20 text-text-primary'
          : 'border-bg-surface bg-bg-primary text-text-secondary hover:border-accent hover:text-text-primary',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span className={clsx('h-2 w-2 rounded-full', zoneColor[zone])} aria-hidden />
      <span>{zone}</span>
    </button>
  );
}

function BlockPairButton({
  pair,
  selected,
  disabled,
  onClick,
}: {
  pair: [BattleZone, BattleZone];
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        'flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
        selected
          ? 'border-info bg-info/20 text-text-primary'
          : 'border-bg-surface bg-bg-primary text-text-secondary hover:border-info hover:text-text-primary',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span className="flex items-center gap-1">
        <span className={clsx('h-1.5 w-1.5 rounded-full', zoneColor[pair[0]])} aria-hidden />
        <span className={clsx('h-1.5 w-1.5 rounded-full', zoneColor[pair[1]])} aria-hidden />
      </span>
      <span>
        {pair[0]} + {pair[1]}
      </span>
    </button>
  );
}

function SelectionSummary({
  attackZone,
  blockPair,
}: {
  attackZone: BattleZone | null;
  blockPair: [BattleZone, BattleZone] | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-text-muted">Attack:</span>
        <span className={attackZone ? 'text-accent' : 'text-text-muted'}>
          {attackZone ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-text-muted">Block:</span>
        <span className={blockPair ? 'text-info' : 'text-text-muted'}>
          {blockPair ? `${blockPair[0]} + ${blockPair[1]}` : '—'}
        </span>
      </div>
    </div>
  );
}
