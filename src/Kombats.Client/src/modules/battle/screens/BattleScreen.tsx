import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { clsx } from 'clsx';
import {
  useBattlePhase,
  useBattleHp,
  useBattleTurn,
  useBattleActions,
  useBattleConnectionState,
} from '../hooks';
import { useBattleStore } from '../store';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '@/modules/player/store';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { BodyZoneSelector } from '../components/BodyZoneSelector';
import { TurnResultPanel } from '../components/TurnResultPanel';
import { BattleEndOverlay } from '../components/BattleEndOverlay';
import { FighterNameplate } from '@/modules/player/components/FighterNameplate';
import { TurnTimer } from '../components/TurnTimer';
import { Spinner } from '@/ui/components/Spinner';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import { logger } from '@/app/logger';
import { getAvatarAsset } from '@/modules/player/avatar-assets';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';
import type { PlayerCardResponse } from '@/types/player';

// DESIGN_REFERENCE.md §1.3 — match LobbyScreen exactly (transparent → ink-navy).
// BattleScreen reuses the lobby's two-stop gradient so the lobby ↔ battle
// hand-off reads as a center-overlay swap, not a scene change.
const sceneOverlayStyle: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, transparent 0%, rgba(var(--rgb-ink-navy), 0.30) 60%, rgba(var(--rgb-ink-navy), 0.60) 100%)',
};

// DESIGN_REFERENCE.md §3.16 — oversized sprite drop shadow + lobby anchor
// (sprite extends 17vh below the viewport so the bottom of the silhouette is
// cropped, identical to LobbyScreen's spriteStyle).
const selfSpriteStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))',
  marginBottom: '-17vh',
};

// DESIGN_REFERENCE.md §3.19 — mirrored opponent sprite. Hue rotation only
// applies when both fighters happen to share the same avatar art (so the
// player can still tell them apart); distinct avatars render naturally.
const opponentSpriteFilterBase = 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))';

// Opponent sprite mirrors the player's lobby anchor so both fighters meet at
// the same bottom band of the scene.
const opponentSpriteOuterStyle: React.CSSProperties = {
  marginBottom: '-17vh',
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
  // Self name comes from playerStore via the default FighterNameplate; only
  // the opponent's display name needs to be derived from the battle store.
  const oppName = isPlayerA ? playerBName : playerAName;
  const myHp = isPlayerA ? playerAHp : playerBHp;
  const oppHp = isPlayerA ? playerBHp : playerAHp;
  const myMaxHp = isPlayerA ? playerAMaxHp : playerBMaxHp;
  const oppMaxHp = isPlayerA ? playerBMaxHp : playerAMaxHp;

  const myCard = usePlayerCardQuery(myFighterId);
  const oppCard = usePlayerCardQuery(oppFighterId);

  const myAvatarSrc = getAvatarAsset(myCard?.avatarId);
  const oppAvatarSrc = getAvatarAsset(oppCard?.avatarId);
  const opponentSpriteInnerStyle: React.CSSProperties = {
    filter:
      myCard?.avatarId && oppCard?.avatarId === myCard.avatarId
        ? `${opponentSpriteFilterBase} hue-rotate(180deg)`
        : opponentSpriteFilterBase,
  };

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

      {/* LEFT — local player. Anchored bottom-left, sprite renders normally
          (no scaleX), HP bar is jade/green via the default `friendly` tone,
          no mirror. Layout (items-center, h-[82vh], marginBottom -17vh) is
          identical to LobbyScreen so the lobby ↔ battle hand-off reads as a
          center-overlay swap, not a scene change. */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-10 flex flex-col items-center">
        <div className="pointer-events-auto">
          <FighterNameplate tone="friendly" hp={myHp} maxHp={myMaxHp} />
        </div>
        <motion.img
          src={myAvatarSrc}
          alt=""
          aria-hidden
          className="pointer-events-none h-[82vh] w-auto object-contain"
          style={selfSpriteStyle}
          initial={reduceMotion ? false : { opacity: 0, x: -50 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={reduceMotion ? undefined : { duration: 0.5 }}
        />
      </div>

      {/* RIGHT — opponent. Anchored bottom-right, sprite mirrored via
          scaleX(-1) so the fighter faces the player, HP bar is crimson/red
          via tone="hostile" and visually mirrored via hpBarMirror so it
          depletes right-to-left. Mirrors the LEFT block geometry so both
          fighters anchor at identical heights. */}
      <div className="pointer-events-none absolute bottom-0 right-0 z-10 flex flex-col items-center">
        <div className="pointer-events-auto">
          <FighterNameplate
            name={oppName}
            level={oppCard?.level ?? null}
            hp={oppHp}
            maxHp={oppMaxHp}
            card={oppCard}
            tone="hostile"
            hpBarMirror
            alignRight
          />
        </div>
        <div
          className="pointer-events-none h-[82vh] w-auto"
          style={{ ...opponentSpriteOuterStyle, transform: 'scaleX(-1)' }}
        >
          <motion.img
            src={oppAvatarSrc}
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
      <div className="absolute left-1/2 top-1/2 z-20 w-[min(380px,calc(100%-2rem))] -translate-x-1/2 -translate-y-[55%]">
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
      <h3
        className="font-display text-[15px] font-black uppercase tracking-[0.24em] text-accent-text"
        style={{ textShadow: 'var(--shadow-title-soft)' }}
      >
        {title}
      </h3>
    </header>
  );
}

// DESIGN_REFERENCE.md §5.17 — meta row: ROUND on the left, timer + lock-in
// grouped together on the right so they read as a single "time left / act"
// pair instead of being stretched across the panel by space-between.
function CombatMetaRow() {
  const { turnIndex } = useBattleTurn();
  const phase = useBattlePhase();
  const actions = useBattleActions();
  const connectionState = useBattleConnectionState();

  const connectionBlocked = connectionState !== 'connected';
  const isTurnOpen = phase === 'TurnOpen';
  const isWaiting = phase === 'Submitted' || phase === 'Resolving';
  const canGo = actions.canSubmit && !connectionBlocked;

  return (
    <div
      className="grid items-center px-1 py-0.5"
      style={{ gridTemplateColumns: '1fr auto 1fr' }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-muted">
        <span>Round</span>
        <span className="font-display font-black tabular-nums text-accent-text">
          {turnIndex > 0 ? turnIndex : '—'}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <TurnTimer />
      </div>

      <div className="flex items-center justify-end">
        {isTurnOpen ? (
          <LockInButton onClick={actions.submitAction} disabled={!canGo} />
        ) : isWaiting ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-accent-text">
            Submitted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-accent-muted)' }}
            />
            Standby
          </span>
        )}
      </div>
    </div>
  );
}

// Outline LOCK IN button. Tailwind utility classes for color/background were
// being visually overridden by panel/state styling, so the resting and hover
// surface colors are written as inline styles using the same gold token as
// the SELECT ATTACK & BLOCK title (--color-accent-primary). Hover is driven
// by component state because inline styles outrank Tailwind's `hover:`
// pseudo-class on the same property.
function LockInButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const filled = hovered && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Lock in attack and block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        'inline-flex items-center justify-center rounded-md px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors duration-150',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      style={{
        background: filled ? 'var(--color-accent-primary)' : 'transparent',
        border: '1px solid var(--color-accent-primary)',
        color: filled
          ? 'var(--color-text-on-accent)'
          : 'var(--color-accent-primary)',
      }}
    >
      Lock In
    </button>
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
