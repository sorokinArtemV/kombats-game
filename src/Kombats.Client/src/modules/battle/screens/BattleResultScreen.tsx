import { Navigate, useNavigate, useParams } from 'react-router';
import { clsx } from 'clsx';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '@/modules/player/store';
import { useBattleStore } from '../store';
import { useBattlePhase, useBattleResult } from '../hooks';
import { deriveOutcome, type BattleEndOutcome } from '../battle-end-outcome';
import { useResultBattleFeed } from '../result-feed';
import { NarrationFeed } from '../components/NarrationFeed';
import { Button } from '@/ui/components/Button';
import { Spinner } from '@/ui/components/Spinner';

function outcomeAccentClass(outcome: BattleEndOutcome): string {
  switch (outcome) {
    case 'victory':
      return 'text-success';
    case 'defeat':
      return 'text-error';
    case 'draw':
      return 'text-info';
    case 'error':
      return 'text-warning';
    default:
      return 'text-text-secondary';
  }
}

export function BattleResultScreen() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();

  const phase = useBattlePhase();
  const { endReason, winnerPlayerId } = useBattleResult();
  const myId = useAuthStore((s) => s.userIdentityId);
  const storeBattleId = useBattleStore((s) => s.battleId);
  const playerAId = useBattleStore((s) => s.playerAId);
  const playerAName = useBattleStore((s) => s.playerAName);
  const playerBName = useBattleStore((s) => s.playerBName);
  const setPostBattleRefreshNeeded = usePlayerStore(
    (s) => s.setPostBattleRefreshNeeded,
  );
  const setQueueStatus = usePlayerStore((s) => s.setQueueStatus);

  const feed = useResultBattleFeed(battleId ?? null);

  if (!battleId) {
    return <p className="p-6 text-error">Missing battle ID.</p>;
  }

  // Explicit mismatch guard: if the store knows about a different battle
  // than the URL is asking for, we're viewing a stale or cross-wired route.
  // Send the player back to the lobby rather than rendering inconsistent
  // outcome + feed data.
  if (storeBattleId !== null && storeBattleId !== battleId) {
    return <Navigate to="/lobby" replace />;
  }

  // Only render result content when the battle is genuinely ended. Other
  // in-battle phases must not be able to display a fake draw/outcome —
  // show the loading state until `BattleEnded` has populated the store
  // (or the mismatch guard above redirects away).
  if (phase !== 'Ended') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const { outcome, title, subtitle } = deriveOutcome(endReason, winnerPlayerId, myId);

  const isPlayerA = myId !== null && myId === playerAId;
  const myName = (isPlayerA ? playerAName : playerBName) ?? 'You';
  const opponentName = (isPlayerA ? playerBName : playerAName) ?? 'Opponent';

  const handleFinish = () => {
    // Optimistically clear the stale queue status so `BattleGuard` does
    // not bounce us back onto `/battle/:id` while the server-side
    // game-state refetch is in flight. `usePostBattleRefresh` will
    // reconcile from the server on the lobby.
    setQueueStatus(null);
    setPostBattleRefreshNeeded(true);
    navigate('/lobby');
  };

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <section className="rounded-lg border border-bg-surface bg-bg-secondary p-6 text-center">
        <h1
          className={clsx(
            'font-display text-4xl',
            outcomeAccentClass(outcome),
          )}
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
        <p className="mt-4 font-mono text-xs text-text-muted">
          {myName} vs {opponentName}
        </p>
        {endReason && outcome === 'other' && (
          <p className="mt-1 font-mono text-xs text-text-muted">Reason: {endReason}</p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        {feed.isError && feed.entries.length === 0 ? (
          <div className="rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
            Could not load the full battle feed.
          </div>
        ) : (
          <NarrationFeed entries={feed.entries} fill />
        )}
      </section>

      <footer className="flex items-center justify-end">
        <Button onClick={handleFinish}>Finish Battle</Button>
      </footer>
    </main>
  );
}
