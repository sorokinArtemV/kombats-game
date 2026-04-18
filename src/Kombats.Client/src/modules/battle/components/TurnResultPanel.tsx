import { clsx } from 'clsx';
import { useBattleStore } from '../store';
import { useAuthStore } from '@/modules/auth/store';
import type {
  AttackOutcomeRealtime,
  AttackResolutionRealtime,
} from '@/types/battle';

const outcomeLabel: Record<AttackOutcomeRealtime, string> = {
  NoAction: 'No action',
  Dodged: 'Dodged',
  Blocked: 'Blocked',
  Hit: 'Hit',
  CriticalHit: 'Critical hit',
  CriticalBypassBlock: 'Critical (bypass block)',
  CriticalHybridBlocked: 'Critical (hybrid block)',
};

function outcomeToneClass(outcome: AttackOutcomeRealtime): string {
  switch (outcome) {
    case 'Hit':
      return 'text-error';
    case 'CriticalHit':
    case 'CriticalBypassBlock':
    case 'CriticalHybridBlocked':
      return 'text-warning';
    case 'Blocked':
      return 'text-info';
    case 'Dodged':
      return 'text-success';
    case 'NoAction':
    default:
      return 'text-text-muted';
  }
}

export function TurnResultPanel() {
  const lastResolution = useBattleStore((s) => s.lastResolution);
  const myId = useAuthStore((s) => s.userIdentityId);
  const playerAId = useBattleStore((s) => s.playerAId);
  const playerAName = useBattleStore((s) => s.playerAName);
  const playerBName = useBattleStore((s) => s.playerBName);

  if (!lastResolution || !lastResolution.log) return null;

  const { atoB, btoA, turnIndex } = lastResolution.log;
  const isPlayerA = myId !== null && myId === playerAId;
  const myName = (isPlayerA ? playerAName : playerBName) ?? 'You';
  const opponentName = (isPlayerA ? playerBName : playerAName) ?? 'Opponent';

  const myAttack = isPlayerA ? atoB : btoA;
  const opponentAttack = isPlayerA ? btoA : atoB;

  // Intermediate payload safety: if the server publishes a Log envelope
  // without both attack resolutions (partial state during resolving), render
  // a turn header instead of crashing on undefined access.
  if (!myAttack || !opponentAttack) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-bg-surface bg-bg-secondary p-4">
        <header className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-wide text-text-primary">
            Turn {turnIndex} Result
          </h2>
        </header>
        <p className="text-xs text-text-muted">Resolving turn…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-bg-surface bg-bg-secondary p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-wide text-text-primary">
          Turn {turnIndex} Result
        </h2>
      </header>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <DirectionRow
          title={`${myName} attacks`}
          attack={myAttack}
          defenderName={opponentName}
        />
        <DirectionRow
          title={`${opponentName} attacks`}
          attack={opponentAttack}
          defenderName={myName}
        />
      </div>
    </div>
  );
}

function DirectionRow({
  title,
  attack,
  defenderName,
}: {
  title: string;
  attack: AttackResolutionRealtime;
  defenderName: string;
}) {
  const blockZones = [attack.defenderBlockPrimary, attack.defenderBlockSecondary]
    .filter((z): z is string => z !== null);

  return (
    <div className="flex flex-col gap-1 rounded-md bg-bg-primary p-3">
      <span className="text-xs uppercase tracking-wide text-text-muted">{title}</span>
      <div className="flex items-center justify-between">
        <span className={clsx('text-sm font-medium', outcomeToneClass(attack.outcome))}>
          {outcomeLabel[attack.outcome]}
        </span>
        {attack.damage > 0 && (
          <span className="font-mono text-sm text-error">-{attack.damage} HP</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-text-muted">Attack zone: </span>
          <span className="text-text-secondary">{attack.attackZone ?? '—'}</span>
        </div>
        <div>
          <span className="text-text-muted">{defenderName} block: </span>
          <span className="text-text-secondary">
            {blockZones.length > 0 ? blockZones.join(' + ') : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
