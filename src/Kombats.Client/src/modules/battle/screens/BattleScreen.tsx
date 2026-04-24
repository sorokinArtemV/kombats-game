import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { clsx } from 'clsx';
import { useBattlePhase, useBattleHp, useBattleTurn } from '../hooks';
import { useBattleStore } from '../store';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '@/modules/player/store';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { BodyZoneSelector } from '../components/BodyZoneSelector';
import { TurnResultPanel } from '../components/TurnResultPanel';
import { BattleEndOverlay } from '../components/BattleEndOverlay';
import { FighterCard } from '../components/FighterCard';
import { TurnTimer } from '../components/TurnTimer';
import { Spinner } from '@/ui/components/Spinner';
import { ConnectionIndicator } from '@/ui/components/ConnectionIndicator';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { logger } from '@/app/logger';
import { useBattleConnectionState } from '../hooks';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';
import fighterSprite from '@/ui/assets/fighters/charackter.png';
import type { PlayerCardResponse } from '@/types/player';

// DESIGN_REFERENCE.md §1.5 — full-bleed scene + ink-navy bottom gradient.
const sceneOverlayStyle: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, rgba(15, 20, 25, 0.40) 0%, rgba(15, 20, 25, 0.15) 35%, rgba(15, 20, 25, 0.88) 100%)',
};

// DESIGN_REFERENCE.md §3.16 — oversized sprite drop shadow.
const selfSpriteStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))',
};

// DESIGN_REFERENCE.md §3.19 — mirrored opponent sprite with hue rotation so
// the shared asset reads as a different fighter.
const opponentSpriteInnerStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.9)) hue-rotate(180deg)',
};

/**
 * Battle layout. Full-bleed scene with bottom-anchored player/opponent
 * sprites + their nameplates, and a centered 540px combat panel containing
 * the round/timer/turn meta row and BodyZoneSelector.
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

  // Self/opponent derivation — DO NOT REORDER. BattleScreen downstream and
  // TurnResultPanel both depend on this being `myId === playerAId`.
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

  const reduceMotion = useReducedMotion();

  const isLoading =
    phase === 'Idle' || phase === 'Connecting' || phase === 'WaitingForJoin';

  if (isLoading) {
    return (
      <div className="relative flex h-full flex-1 items-center justify-center overflow-hidden">
        <img
          src={bgScene}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={sceneOverlayStyle}
        />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
            Connecting to the arena…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {/* Scene + overlay */}
      <img
        src={bgScene}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={sceneOverlayStyle}
      />

      {/* Self sprite + nameplate (bottom-left). */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 flex flex-col items-start pl-4 sm:pl-8">
        <div className="pointer-events-auto mb-2">
          <FighterCard
            name={myName}
            level={myCard?.level ?? null}
            tone="friendly"
            hp={myHp}
            maxHp={myMaxHp}
            card={myCard}
          />
        </div>
        <motion.img
          src={fighterSprite}
          alt=""
          aria-hidden
          className="pointer-events-none h-[min(70vh,620px)] w-auto object-contain"
          style={selfSpriteStyle}
          initial={reduceMotion ? false : { opacity: 0, x: -50 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={reduceMotion ? undefined : { duration: 0.5 }}
        />
      </div>

      {/* Opponent sprite + nameplate (bottom-right, mirrored sprite). */}
      <div className="pointer-events-none absolute bottom-0 right-0 z-10 flex flex-col items-end pr-4 sm:pr-8">
        <div className="pointer-events-auto mb-2">
          <FighterCard
            name={oppName}
            level={oppCard?.level ?? null}
            tone="hostile"
            hp={oppHp}
            maxHp={oppMaxHp}
            card={oppCard}
            hpBarMirror
            alignRight
          />
        </div>
        <div
          className="pointer-events-none h-[min(70vh,620px)] w-auto"
          style={{ transform: 'scaleX(-1)' }}
        >
          <motion.img
            src={fighterSprite}
            alt=""
            aria-hidden
            className="pointer-events-none h-full w-auto object-contain"
            style={opponentSpriteInnerStyle}
            initial={reduceMotion ? false : { opacity: 0, x: -50 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={reduceMotion ? undefined : { duration: 0.5 }}
          />
        </div>
      </div>

      {/* Center combat panel. Offset up so it clears the nameplates on shorter
          viewports, with min-height safety. */}
      <div className="absolute left-1/2 top-1/2 z-20 w-[min(540px,calc(100%-2rem))] -translate-x-1/2 -translate-y-[55%]">
        <section
          className="rounded-md border-[0.5px] border-border-subtle bg-glass p-5 shadow-[var(--shadow-panel-lift)]"
          style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          <CombatPanelHeader />
          <CombatMetaRow />

          <div className="my-4 h-px bg-border-divider" aria-hidden />

          {phase === 'Error' && lastError && (
            <div className="mb-3 flex flex-col gap-2">
              <Banner tone="error">{lastError}</Banner>
              <LeaveBattleEscape />
            </div>
          )}
          {phase === 'ConnectionLost' && (
            <div className="mb-3">
              <ConnectionLostBanner />
            </div>
          )}

          <ErrorBoundary
            fallback={
              <Banner tone="error">
                Something went wrong rendering this turn. Waiting for the next
                server update…
              </Banner>
            }
            onError={(error) => {
              logger.error('BattleScreen render error', error);
            }}
          >
            <ActionPanelSlot />
          </ErrorBoundary>
        </section>
      </div>

      <BattleEndOverlay />
    </div>
  );
}

function ActionPanelSlot() {
  const phase = useBattlePhase();

  if (phase === 'TurnOpen' || phase === 'Submitted' || phase === 'Resolving') {
    return <BodyZoneSelector />;
  }
  // For ArenaOpen / Ended / fallback show the latest turn result.
  return <TurnResultPanel />;
}

function CombatPanelHeader() {
  const phase = useBattlePhase();
  const title =
    phase === 'Submitted' || phase === 'Resolving'
      ? 'Awaiting Opponent'
      : phase === 'Ended'
        ? 'Battle Concluded'
        : 'Select Attack & Block';
  return (
    <header className="mb-3 text-center">
      <h1
        className="font-display uppercase"
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '0.24em',
          color: 'var(--color-accent-text)',
          textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
        }}
      >
        {title}
      </h1>
    </header>
  );
}

// DESIGN_REFERENCE.md §5.17 — 3-col grid: round label / center timer / turn pill.
function CombatMetaRow() {
  const { turnIndex } = useBattleTurn();
  const phase = useBattlePhase();
  const connectionState = useBattleConnectionState();

  const isYourTurn = phase === 'TurnOpen';
  const isWaiting = phase === 'Submitted' || phase === 'Resolving';

  return (
    <div
      className="grid items-center px-1 py-0.5"
      style={{ gridTemplateColumns: '1fr auto 1fr' }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-muted">
        <span>Round</span>
        <span className="font-display tabular-nums text-accent-text">
          {turnIndex > 0 ? turnIndex : '—'}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <TurnTimer />
      </div>

      <div className="flex items-center justify-end gap-2">
        <ConnectionIndicator state={connectionState} className="shrink-0" />
        <TurnIndicatorPill
          state={
            isYourTurn ? 'your_turn' : isWaiting ? 'opponent_turn' : 'idle'
          }
        />
      </div>
    </div>
  );
}

function TurnIndicatorPill({
  state,
}: {
  state: 'your_turn' | 'opponent_turn' | 'idle';
}) {
  const label =
    state === 'your_turn'
      ? 'Your Turn'
      : state === 'opponent_turn'
        ? "Opponent's Turn"
        : 'Standby';
  const dot =
    state === 'your_turn'
      ? {
          background: '#c9a25a',
          boxShadow: '0 0 8px rgba(201, 169, 97, 0.55)',
        }
      : {
          background: 'rgba(201, 162, 90, 0.60)',
          boxShadow: 'none',
        };
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={dot}
      />
      {label}
    </span>
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
      ? 'border-kombats-crimson bg-kombats-crimson/10 text-kombats-crimson-light'
      : 'border-victory-gold bg-victory-gold/10 text-victory-gold';
  return (
    <div
      className={clsx(
        'rounded-sm border px-3 py-2 text-[11px] uppercase tracking-[0.18em]',
        cls,
      )}
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  );
}

/**
 * Terminal battle-error escape. The BattleHub reached its `failed` state
 * (reconnect attempted and could not restore) or the store transitioned to
 * `phase: 'Error'` some other way. Without this button the user is stuck
 * staring at the error banner — the only way out was a hard refresh.
 *
 * Clicking it clears the battle store and fires the atomic post-battle
 * handoff on the player store so (a) stale `queueStatus.Matched.<battleId>`
 * refetches are suppressed and the BattleGuard does not bounce us back
 * into the broken battle, and (b) the lobby's usePostBattleRefresh flag
 * is set so XP/level reconcile on the next lobby mount.
 */
function LeaveBattleEscape() {
  const navigate = useNavigate();
  const battleId = useBattleStore((s) => s.battleId);
  const returnFromBattle = usePlayerStore((s) => s.returnFromBattle);

  const handleLeave = () => {
    if (battleId) {
      returnFromBattle(battleId);
    } else {
      // No battleId means the store never transitioned past the pre-match
      // phases; the simpler path is enough.
      usePlayerStore.getState().setQueueStatus(null);
    }
    useBattleStore.getState().reset();
    navigate('/lobby');
  };

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={handleLeave}
        className="inline-flex items-center justify-center rounded-sm border border-kombats-crimson bg-transparent px-4 py-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-kombats-crimson-light transition-colors duration-150 hover:bg-kombats-crimson hover:text-text-on-danger"
      >
        Leave Battle
      </button>
    </div>
  );
}

function ConnectionLostBanner() {
  // Pull the live connection state so the banner stays truthful across the
  // reconnecting → connected window. Without this, "reconnecting…" could
  // linger briefly after SignalR actually comes back up.
  const connectionState = useBattleConnectionState();
  const message =
    connectionState === 'reconnecting'
      ? 'Connection lost — reconnecting…'
      : connectionState === 'connecting'
        ? 'Reconnecting to the battle…'
        : 'Connection unstable — waiting for server.';
  return <Banner tone="warning">{message}</Banner>;
}

function usePlayerCardQuery(playerId: string | null): PlayerCardResponse | null {
  const query = useQuery({
    queryKey: playerKeys.card(playerId ?? ''),
    queryFn: () => playersApi.getCard(playerId!),
    enabled: !!playerId,
    staleTime: 60_000,
  });
  return query.data ?? null;
}
