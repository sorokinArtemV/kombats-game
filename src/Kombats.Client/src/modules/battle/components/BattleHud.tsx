import { clsx } from 'clsx';
import { useBattleStore } from '../store';
import { useBattleHp, useBattleTurn, useBattlePhase, useBattleConnectionState } from '../hooks';
import { useAuthStore } from '@/modules/auth/store';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { ConnectionIndicator } from '@/ui/components/ConnectionIndicator';
import { TurnTimer } from './TurnTimer';
import type { BattlePhase } from '../store';

const phaseLabel: Record<BattlePhase, string> = {
  Idle: 'Idle',
  Connecting: 'Connecting…',
  WaitingForJoin: 'Joining battle…',
  ArenaOpen: 'Arena open',
  TurnOpen: 'Your turn',
  Submitted: 'Waiting for opponent',
  Resolving: 'Resolving…',
  Ended: 'Battle ended',
  ConnectionLost: 'Connection lost',
  Error: 'Error',
};

function hpColorClass(ratio: number): string {
  if (ratio > 0.5) return 'bg-hp-high';
  if (ratio > 0.25) return 'bg-hp-medium';
  return 'bg-hp-low';
}

export function BattleHud() {
  const myId = useAuthStore((s) => s.userIdentityId);
  const playerAId = useBattleStore((s) => s.playerAId);
  const playerAName = useBattleStore((s) => s.playerAName);
  const playerBName = useBattleStore((s) => s.playerBName);
  const { playerAHp, playerBHp, playerAMaxHp, playerBMaxHp } = useBattleHp();
  const { turnIndex } = useBattleTurn();
  const phase = useBattlePhase();
  const connectionState = useBattleConnectionState();

  const isPlayerA = myId !== null && myId === playerAId;
  const myName = (isPlayerA ? playerAName : playerBName) ?? 'You';
  const opponentName = (isPlayerA ? playerBName : playerAName) ?? 'Opponent';
  const myHp = isPlayerA ? playerAHp : playerBHp;
  const myMaxHp = isPlayerA ? playerAMaxHp : playerBMaxHp;
  const opponentHp = isPlayerA ? playerBHp : playerAHp;
  const opponentMaxHp = isPlayerA ? playerBMaxHp : playerAMaxHp;

  return (
    <div className="flex flex-col gap-3 border-b border-bg-surface bg-bg-secondary px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <HpPanel name={myName} hp={myHp} maxHp={myMaxHp} align="left" />
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-xs uppercase tracking-wide text-text-muted">
            Turn
          </span>
          <span className="font-display text-2xl text-text-primary">
            {turnIndex > 0 ? turnIndex : '—'}
          </span>
          <TurnTimer />
        </div>
        <HpPanel name={opponentName} hp={opponentHp} maxHp={opponentMaxHp} align="right" />
      </div>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className={clsx('font-medium', phaseToneClass(phase))}>{phaseLabel[phase]}</span>
        <ConnectionIndicator state={connectionState} />
      </div>
    </div>
  );
}

function phaseToneClass(phase: BattlePhase): string {
  switch (phase) {
    case 'TurnOpen':
      return 'text-accent';
    case 'Submitted':
      return 'text-info';
    case 'Resolving':
      return 'text-warning';
    case 'Ended':
      return 'text-text-secondary';
    case 'ConnectionLost':
    case 'Error':
      return 'text-error';
    default:
      return 'text-text-muted';
  }
}

function HpPanel({
  name,
  hp,
  maxHp,
  align,
}: {
  name: string;
  hp: number | null;
  maxHp: number | null;
  align: 'left' | 'right';
}) {
  const ready = hp !== null && maxHp !== null && maxHp > 0;
  const ratio = ready ? hp / maxHp : 0;
  // Render a full-width neutral bar before the snapshot arrives so the UI
  // doesn't flash red/empty while HP data is still null.
  const barValue = ready ? hp : 1;
  const barMax = ready ? maxHp : 1;
  const barColor = ready ? hpColorClass(ratio) : 'bg-bg-surface';

  return (
    <div className={clsx('flex min-w-0 flex-1 flex-col gap-1', align === 'right' && 'items-end')}>
      <div
        className={clsx(
          'flex w-full items-baseline gap-2',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        <span className="truncate font-display text-sm text-text-primary">{name}</span>
        <span className="font-mono text-xs text-text-muted">
          {ready ? `${hp} / ${maxHp}` : '— / —'}
        </span>
      </div>
      <ProgressBar value={barValue} max={barMax} colorClass={barColor} className="w-full" />
    </div>
  );
}
