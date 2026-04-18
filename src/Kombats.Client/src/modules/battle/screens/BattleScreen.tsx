import { useQuery } from '@tanstack/react-query';
import { useBattlePhase, useBattleHp, useBattleTurn } from '../hooks';
import { useBattleStore } from '../store';
import { useAuthStore } from '@/modules/auth/store';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { ZoneSelector } from '../components/ZoneSelector';
import { TurnResultPanel } from '../components/TurnResultPanel';
import { NarrationFeed } from '../components/NarrationFeed';
import { BattleEndOverlay } from '../components/BattleEndOverlay';
import { FighterCard } from '../components/FighterCard';
import { TurnTimer } from '../components/TurnTimer';
import { Spinner } from '@/ui/components/Spinner';
import { ConnectionIndicator } from '@/ui/components/ConnectionIndicator';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { useBattleConnectionState } from '../hooks';
import type { PlayerCardResponse } from '@/types/player';

/**
 * Battle layout per design:
 *   [ FighterCard self ] [ action area + battle log ] [ FighterCard opponent ]
 * The session-level chat dock continues to render below this main area.
 */
export function BattleScreen() {
  const phase = useBattlePhase();
  const lastError = useBattleStore((s) => s.lastError);
  const myId = useAuthStore((s) => s.userIdentityId);
  const playerAId = useBattleStore((s) => s.playerAId);
  const playerBId = useBattleStore((s) => s.playerBId);
  const playerAName = useBattleStore((s) => s.playerAName) ?? 'Player A';
  const playerBName = useBattleStore((s) => s.playerBName) ?? 'Player B';
  const { playerAHp, playerBHp, playerAMaxHp, playerBMaxHp } = useBattleHp();

  const isPlayerA = myId !== null && myId === playerAId;
  const myFighterId = isPlayerA ? playerAId : playerBId;
  const oppFighterId = isPlayerA ? playerBId : playerAId;
  const myName = isPlayerA ? playerAName : playerBName;
  const oppName = isPlayerA ? playerBName : playerAName;
  const myHp = isPlayerA ? playerAHp : playerBHp;
  const oppHp = isPlayerA ? playerBHp : playerAHp;
  const myMaxHp = isPlayerA ? playerAMaxHp : playerBMaxHp;
  const oppMaxHp = isPlayerA ? playerBMaxHp : playerAMaxHp;

  const myCard = usePlayerCardQuery(myFighterId);
  const oppCard = usePlayerCardQuery(oppFighterId);

  const isLoading =
    phase === 'Idle' || phase === 'Connecting' || phase === 'WaitingForJoin';

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden p-3">
      <FighterCard
        name={myName}
        level={myCard?.level ?? null}
        tone="friendly"
        hp={myHp}
        maxHp={myMaxHp}
        stats={cardToStats(myCard)}
        statusLabel={statusFor(phase, 'self')}
        statusVariant={phase === 'TurnOpen' ? 'success' : 'default'}
      />

      <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <TurnInfoBar />

        {phase === 'Error' && lastError && (
          <Banner tone="error">{lastError}</Banner>
        )}
        {phase === 'ConnectionLost' && (
          <Banner tone="warning">Connection lost — reconnecting…</Banner>
        )}

        <ErrorBoundary
          fallback={
            <Banner tone="error">
              Something went wrong rendering this turn. Waiting for the next
              server update…
            </Banner>
          }
          onError={(error) => {
            console.error('BattleScreen render error', error);
          }}
        >
          <ActionPanelSlot />
        </ErrorBoundary>

        <NarrationFeed fill />
      </section>

      <FighterCard
        name={oppName}
        level={oppCard?.level ?? null}
        tone="hostile"
        hp={oppHp}
        maxHp={oppMaxHp}
        stats={cardToStats(oppCard)}
        statusLabel={statusFor(phase, 'opponent')}
        statusVariant="warning"
      />

      <BattleEndOverlay />
    </div>
  );
}

function ActionPanelSlot() {
  const phase = useBattlePhase();

  if (phase === 'TurnOpen') return <ZoneSelector />;
  if (phase === 'Submitted') return <WaitingPanel kind="submitted" />;
  if (phase === 'Resolving') return <WaitingPanel kind="resolving" />;
  // For ArenaOpen / Ended / fallback show the latest turn result
  return <TurnResultPanel />;
}

function TurnInfoBar() {
  const { turnIndex } = useBattleTurn();
  const connectionState = useBattleConnectionState();
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg-secondary px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-display uppercase tracking-wide text-text-muted">
          Turn
        </span>
        <span className="font-display text-base font-semibold text-text-primary">
          {turnIndex > 0 ? turnIndex : '—'}
        </span>
      </div>
      <TurnTimer />
      <ConnectionIndicator state={connectionState} />
    </div>
  );
}

function WaitingPanel({ kind }: { kind: 'submitted' | 'resolving' }) {
  const title = kind === 'submitted' ? 'Waiting for opponent turn' : 'Resolving turn…';
  const subtitle =
    kind === 'submitted' ? 'Your turn has been submitted' : 'Calculating outcome';
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-bg-secondary py-8">
      <HourglassIcon />
      <p className="font-display text-base font-semibold text-text-primary">{title}</p>
      <p className="text-xs text-text-muted">{subtitle}</p>
      <span className="inline-flex items-center rounded-full bg-warning/20 px-3 py-1 text-xs font-medium text-warning animate-pulse">
        Turn in progress
      </span>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: 'error' | 'warning';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'error'
      ? 'border-error bg-error/10 text-error'
      : 'border-warning bg-warning/10 text-warning';
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${cls}`}>{children}</div>
  );
}

function HourglassIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-muted"
      aria-hidden="true"
    >
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}

function cardToStats(card: PlayerCardResponse | null | undefined) {
  if (!card) {
    return [
      ['Strength', 0],
      ['Agility', 0],
      ['Intuition', 0],
      ['Vitality', 0],
    ] as const;
  }
  return [
    ['Strength', card.strength],
    ['Agility', card.agility],
    ['Intuition', card.intuition],
    ['Vitality', card.vitality],
  ] as const;
}

function statusFor(phase: ReturnType<typeof useBattlePhase>, who: 'self' | 'opponent'): string {
  switch (phase) {
    case 'TurnOpen':
      return who === 'self' ? 'Choosing' : 'Waiting';
    case 'Submitted':
      return who === 'self' ? 'Ready' : 'Choosing';
    case 'Resolving':
      return 'Resolving';
    case 'Ended':
      return 'Ended';
    default:
      return 'Standby';
  }
}

function usePlayerCardQuery(playerId: string | null) {
  const query = useQuery({
    queryKey: playerKeys.card(playerId ?? ''),
    queryFn: () => playersApi.getCard(playerId!),
    enabled: !!playerId,
    staleTime: 60_000,
  });
  return query.data ?? null;
}
