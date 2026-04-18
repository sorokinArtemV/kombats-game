import { Navigate, useNavigate, useParams } from 'react-router';
import { clsx } from 'clsx';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '@/modules/player/store';
import { useBattleStore } from '../store';
import { useBattlePhase, useBattleResult } from '../hooks';
import { deriveOutcome, type BattleEndOutcome } from '../battle-end-outcome';
import { useResultBattleFeed } from '../result-feed';
import { NarrationFeed } from '../components/NarrationFeed';
import { Spinner } from '@/ui/components/Spinner';

interface ToneTokens {
  accentClass: string;
  iconBg: string;
  iconShadow: string;
  containerBg: string;
  border: string;
  primaryButton: string;
  secondaryButton: string;
}

const TONE: Record<BattleEndOutcome, ToneTokens> = {
  victory: {
    accentClass: 'text-success',
    iconBg: 'bg-success',
    iconShadow: 'shadow-[0_0_40px_rgba(76,175,80,0.4)]',
    containerBg: 'bg-[#1b2e1b]',
    border: 'border-success',
    primaryButton: 'bg-success hover:bg-go-hover',
    secondaryButton: 'border-success text-success hover:bg-success/10',
  },
  defeat: {
    accentClass: 'text-error',
    iconBg: 'bg-error',
    iconShadow: 'shadow-[0_0_40px_rgba(244,67,54,0.4)]',
    containerBg: 'bg-[#2e1b1b]',
    border: 'border-error',
    primaryButton: 'bg-bg-surface hover:bg-border-strong',
    secondaryButton: 'border-error text-error hover:bg-error/10',
  },
  draw: {
    accentClass: 'text-info',
    iconBg: 'bg-info',
    iconShadow: 'shadow-[0_0_40px_rgba(33,150,243,0.4)]',
    containerBg: 'bg-bg-secondary',
    border: 'border-info',
    primaryButton: 'bg-info hover:bg-block-strong',
    secondaryButton: 'border-info text-info hover:bg-info/10',
  },
  error: {
    accentClass: 'text-warning',
    iconBg: 'bg-warning',
    iconShadow: 'shadow-[0_0_40px_rgba(255,152,0,0.4)]',
    containerBg: 'bg-bg-secondary',
    border: 'border-warning',
    primaryButton: 'bg-warning hover:opacity-90',
    secondaryButton: 'border-warning text-warning hover:bg-warning/10',
  },
  other: {
    accentClass: 'text-text-secondary',
    iconBg: 'bg-bg-surface',
    iconShadow: 'shadow-none',
    containerBg: 'bg-bg-secondary',
    border: 'border-border',
    primaryButton: 'bg-accent hover:bg-accent-hover',
    secondaryButton: 'border-border-strong text-text-secondary hover:bg-bg-surface',
  },
};

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
  const returnFromBattle = usePlayerStore((s) => s.returnFromBattle);

  const feed = useResultBattleFeed(battleId ?? null);

  if (!battleId) {
    return <p className="p-6 text-error">Missing battle ID.</p>;
  }

  if (storeBattleId !== null && storeBattleId !== battleId) {
    return <Navigate to="/lobby" replace />;
  }

  if (phase !== 'Ended') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const { outcome, title, subtitle } = deriveOutcome(endReason, winnerPlayerId, myId);
  const tone = TONE[outcome];

  const isPlayerA = myId !== null && myId === playerAId;
  const myName = (isPlayerA ? playerAName : playerBName) ?? 'You';
  const opponentName = (isPlayerA ? playerBName : playerAName) ?? 'Opponent';

  const handleReturn = () => {
    // Atomic post-battle handoff. Marks the battle dismissed (so stale
    // `queueStatus.Matched.<battleId>` refetches are suppressed until the
    // backend projection catches up), clears any active queue entry, and
    // flags the next lobby mount to run the DEC-5 XP/level refresh.
    returnFromBattle(battleId);
    navigate('/lobby');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-3">
      <section
        className={clsx(
          'flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto rounded-md border-2 p-8',
          tone.containerBg,
          tone.border,
        )}
      >
        <div
          className={clsx(
            'flex h-[120px] w-[120px] items-center justify-center rounded-full',
            tone.iconBg,
            tone.iconShadow,
          )}
        >
          {outcome === 'victory' ? (
            <TrophyIcon />
          ) : outcome === 'defeat' ? (
            <CloseIcon />
          ) : (
            <ScalesIcon />
          )}
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h1
            className={clsx(
              'font-display text-5xl font-bold uppercase tracking-[0.25em] drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]',
              tone.accentClass,
            )}
          >
            {title.replace(/!$/, '')}
          </h1>
          <p className="text-base text-text-secondary">{subtitle}</p>
          <p className="font-mono text-xs text-text-muted">
            {myName} vs {opponentName}
          </p>
          {endReason && outcome === 'other' && endReason !== 'Unknown' && (
            <p className="font-mono text-xs text-text-muted">Reason: {endReason}</p>
          )}
        </div>

        <div className="w-full max-w-md rounded-md bg-bg-elevated/80 p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">
            Match Summary
          </p>
          <div className="flex h-48 min-h-0 flex-col">
            {feed.isError && feed.entries.length === 0 ? (
              <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-xs text-warning">
                Could not load the full battle feed.
              </div>
            ) : (
              <NarrationFeed entries={feed.entries} fill />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleReturn}
            className={clsx(
              'inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-semibold text-white transition-colors',
              tone.primaryButton,
            )}
          >
            Return to Lobby
          </button>
          <button
            type="button"
            onClick={handleReturn}
            className={clsx(
              'inline-flex items-center justify-center rounded-md border-2 bg-transparent px-6 py-2.5 text-sm font-semibold transition-colors',
              tone.secondaryButton,
            )}
          >
            Play Again
          </button>
        </div>
      </section>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-white"
      aria-hidden="true"
    >
      <path d="M7 4V2h10v2h4v4a4 4 0 0 1-4 4 5 5 0 0 1-4 4v2h3v2H8v-2h3v-2a5 5 0 0 1-4-4 4 4 0 0 1-4-4V4h4zm0 2H5v2a2 2 0 0 0 2 2V6zm10 0v4a2 2 0 0 0 2-2V6h-2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ScalesIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white"
      aria-hidden="true"
    >
      <path d="M16 16.5a3.5 3.5 0 1 1-7 0" />
      <path d="M12 3v18" />
      <path d="M3 7h18" />
    </svg>
  );
}
