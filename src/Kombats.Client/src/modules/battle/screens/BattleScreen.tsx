import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { useBattleConnection, useBattle, useBattleActions } from '../hooks';
import { ALL_ZONES, VALID_BLOCK_PAIRS } from '../zones';
import { useAuthStore } from '@/modules/auth/store';
import { clsx } from 'clsx';
import type { BattleZone } from '@/types/battle';

export function BattleScreen() {
  const { battleId } = useParams<{ battleId: string }>();

  if (!battleId) {
    return <p className="p-4 text-error">Missing battle ID</p>;
  }

  return <BattleScreenInner battleId={battleId} />;
}

function BattleScreenInner({ battleId }: { battleId: string }) {
  useBattleConnection(battleId);

  const battle = useBattle();
  const actions = useBattleActions();
  const myId = useAuthStore((s) => s.userIdentityId);

  const isPlayerA = myId === battle.playerAId;
  const myName = isPlayerA ? battle.playerAName : battle.playerBName;
  const opponentName = isPlayerA ? battle.playerBName : battle.playerAName;
  const myHp = isPlayerA ? battle.playerAHp : battle.playerBHp;
  const myMaxHp = isPlayerA ? battle.playerAMaxHp : battle.playerBMaxHp;
  const opponentHp = isPlayerA ? battle.playerBHp : battle.playerAHp;
  const opponentMaxHp = isPlayerA ? battle.playerBMaxHp : battle.playerAMaxHp;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-display text-lg text-text-primary">
        Battle Debug View
      </h1>

      {/* Phase + Identity */}
      <Section title="Status">
        <Row label="Phase" value={battle.phase} />
        <Row label="Battle ID" value={battleId} />
        <Row label="Turn" value={String(battle.turnIndex)} />
        <DeadlineCountdown deadlineUtc={battle.deadlineUtc} />
        <ConnectionStateRow connectionState={battle.connectionState} />
        {battle.lastError && <Row label="Error" value={battle.lastError} />}
      </Section>

      {/* HP */}
      <Section title="Health">
        <Row label={`${myName ?? 'You'} HP`} value={`${myHp ?? '?'} / ${myMaxHp ?? '?'}`} />
        <Row label={`${opponentName ?? 'Opponent'} HP`} value={`${opponentHp ?? '?'} / ${opponentMaxHp ?? '?'}`} />
      </Section>

      {/* Action Selection */}
      {(battle.phase === 'TurnOpen' || battle.phase === 'Submitted') && (
        <Section title="Actions">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted">Attack Zone:</p>
            <div className="flex flex-wrap gap-1">
              {ALL_ZONES.map((zone) => (
                <ZoneButton
                  key={zone}
                  zone={zone}
                  selected={actions.selectedAttackZone === zone}
                  disabled={battle.phase === 'Submitted'}
                  onClick={() => actions.selectAttackZone(zone)}
                />
              ))}
            </div>

            <p className="text-xs text-text-muted">Block Pair:</p>
            <div className="flex flex-wrap gap-1">
              {VALID_BLOCK_PAIRS.map((pair) => {
                const label = `${pair[0]}+${pair[1]}`;
                const selected =
                  actions.selectedBlockPair?.[0] === pair[0] &&
                  actions.selectedBlockPair?.[1] === pair[1];
                return (
                  <button
                    key={label}
                    onClick={() => actions.selectBlockPair(pair)}
                    disabled={battle.phase === 'Submitted'}
                    className={clsx(
                      'rounded px-2 py-1 text-xs transition-colors',
                      selected
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-surface text-text-secondary hover:bg-bg-primary',
                      battle.phase === 'Submitted' && 'opacity-50',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={actions.submitAction}
              disabled={!actions.canSubmit}
              className="mt-2 self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {actions.isSubmitting ? 'Submitted' : 'Submit Action'}
            </button>
          </div>
        </Section>
      )}

      {/* Last Resolution */}
      {battle.lastResolution && (
        <Section title="Last Resolution">
          <Row label="Turn" value={String(battle.lastResolution.turnIndex)} />
          <Row label="Player A Action" value={battle.lastResolution.playerAAction} />
          <Row label="Player B Action" value={battle.lastResolution.playerBAction} />
          {battle.lastResolution.log && (
            <>
              <Row label="A->B Outcome" value={battle.lastResolution.log.aToB.outcome} />
              <Row label="A->B Damage" value={String(battle.lastResolution.log.aToB.damage)} />
              <Row label="B->A Outcome" value={battle.lastResolution.log.bToA.outcome} />
              <Row label="B->A Damage" value={String(battle.lastResolution.log.bToA.damage)} />
            </>
          )}
        </Section>
      )}

      {/* End State */}
      {battle.phase === 'Ended' && (
        <Section title="Result">
          <Row label="Reason" value={battle.endReason ?? '—'} />
          <Row
            label="Winner"
            value={
              battle.winnerPlayerId === myId
                ? 'You!'
                : battle.winnerPlayerId
                  ? opponentName ?? 'Opponent'
                  : 'Draw'
            }
          />
          <Link
            to={`/battle/${battleId}/result`}
            className="mt-2 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-accent-hover"
          >
            Continue to Result
          </Link>
        </Section>
      )}

      {/* Feed */}
      {battle.feedEntries.length > 0 && (
        <Section title="Battle Feed">
          <div className="max-h-48 overflow-y-auto">
            {battle.feedEntries.map((entry) => (
              <div key={entry.key} className="border-b border-bg-surface py-1">
                <span className="mr-2 text-xs text-text-muted">T{entry.turnIndex}</span>
                <span
                  className={clsx(
                    'text-xs',
                    entry.severity === 'Critical'
                      ? 'text-error'
                      : entry.severity === 'Important'
                        ? 'text-warning'
                        : 'text-text-secondary',
                  )}
                >
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-bg-surface bg-bg-secondary p-3">
      <h2 className="mb-2 text-sm font-medium text-text-primary">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-mono text-xs text-text-primary">{value}</span>
    </div>
  );
}

function DeadlineCountdown({ deadlineUtc }: { deadlineUtc: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineUtc) return;
    const deadlineMs = new Date(deadlineUtc).getTime();

    const update = () => {
      const ms = deadlineMs - Date.now();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };

    // setInterval callback is not synchronous within the effect body —
    // it's an external subscription, which satisfies react-hooks/set-state-in-effect.
    update();
    const timer = setInterval(update, 250);
    return () => {
      clearInterval(timer);
      setRemaining(null);
    };
  }, [deadlineUtc]);

  if (remaining === null) {
    return <Row label="Deadline" value="—" />;
  }

  return <Row label="Deadline" value={`${remaining}s`} />;
}

function ConnectionStateRow({ connectionState }: { connectionState: string }) {
  const colorClass =
    connectionState === 'connected'
      ? 'text-success'
      : connectionState === 'disconnected'
        ? 'text-error'
        : 'text-warning';

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-text-muted">Connection</span>
      <span className={clsx('font-mono text-xs', colorClass)}>{connectionState}</span>
    </div>
  );
}

function ZoneButton({
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
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'rounded px-2 py-1 text-xs transition-colors',
        selected
          ? 'bg-accent text-text-primary'
          : 'bg-bg-surface text-text-secondary hover:bg-bg-primary',
        disabled && 'opacity-50',
      )}
    >
      {zone}
    </button>
  );
}
