import { useState, useEffect } from 'react';
import { Button } from '@/ui/components/Button';
import { SearchingIndicator } from '../components/SearchingIndicator';
import { useMatchmaking, useMatchmakingPolling } from '../hooks';
import { FighterNameplate } from '@/modules/player/components/FighterNameplate';
import { usePlayerStore } from '@/modules/player/store';
import { getAvatarAsset } from '@/modules/player/avatar-assets';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';

// DESIGN_REFERENCE.md §1.3 / §1.4 — same lobby scene + bottom ink-navy
// gradient overlay, reused across the queue search screen so the transition
// from lobby to matchmaking is visually seamless.
const sceneOverlayStyle: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, rgba(var(--rgb-ink-navy), 0.45) 0%, rgba(var(--rgb-ink-navy), 0.15) 40%, rgba(var(--rgb-ink-navy), 0.88) 100%)',
};

// DESIGN_REFERENCE.md §3.16 — oversized sprite drop shadow.
const spriteStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))',
};

/**
 * Queue search screen — same scene composition as LobbyScreen with the
 * centered `QueueCard` switched to its `searching` state
 * (DESIGN_REFERENCE.md §1.4 + §5.10).
 *
 * `useMatchmakingPolling()` must stay at the top of the component so the
 * poller's lifecycle tracks the mount, not any conditional branch.
 */
export function SearchingScreen() {
  const {
    status,
    searchStartedAt,
    consecutiveFailures,
    leaveQueue,
  } = useMatchmaking();
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const character = usePlayerStore((s) => s.character);

  useMatchmakingPolling();

  useEffect(() => {
    if (!searchStartedAt) return;

    setElapsed(Math.floor((Date.now() - searchStartedAt) / 1000));

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - searchStartedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [searchStartedAt]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await leaveQueue();
    } finally {
      setCancelling(false);
    }
  };

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeDisplay = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const headerText =
    status === 'matched'
      ? 'Opponent found — preparing battle…'
      : status === 'battleTransition'
        ? 'Entering battle…'
        : 'Searching for opponent…';

  const canCancel = status === 'searching' || status === 'matched';

  return (
    // `-m-3` cancels LobbyShell's p-3 so the scene reaches the edges of the
    // available region, matching the lobby's full-bleed composition.
    <div className="relative -m-3 h-[calc(100%+1.5rem)] min-h-0 overflow-hidden">
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-start pl-6 sm:pl-10">
        <div className="pointer-events-auto flex flex-col items-start gap-4">
          <FighterNameplate />
          <img
            src={getAvatarAsset(character?.avatarId)}
            alt=""
            aria-hidden
            className="pointer-events-none h-[min(82vh,720px)] w-auto object-contain"
            style={spriteStyle}
          />
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 z-20 w-[min(420px,calc(100%-3rem))] -translate-x-1/2 -translate-y-[55%]">
        <section className="rounded-md border-[0.5px] border-border-subtle bg-glass p-6 shadow-[var(--shadow-panel-lift)] backdrop-blur-[20px]">
          <header className="flex flex-col items-center gap-1 pb-5 text-center">
            <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-text-muted">
              Arena
            </span>
            <h1
              className="font-display text-[16px] font-semibold uppercase tracking-[0.24em] text-accent-text"
              style={{ textShadow: 'var(--shadow-title-soft)' }}
            >
              {headerText}
            </h1>
          </header>

          <div className="flex flex-col items-center gap-4">
            <SearchingIndicator />

            {status === 'searching' && (
              <div
                className="flex items-center gap-2 font-display text-[13px] tabular-nums text-accent-text"
                aria-live="polite"
              >
                <ClockIcon />
                <span>{timeDisplay}</span>
              </div>
            )}

            {consecutiveFailures >= 3 && (
              <p
                className="text-center text-[11px] uppercase tracking-[0.18em] text-kombats-crimson-light"
                role="alert"
              >
                Connection issues — retrying…
              </p>
            )}

            {canCancel && (
              <Button
                variant="secondary"
                onClick={handleCancel}
                loading={cancelling}
                disabled={cancelling}
              >
                Cancel Search
              </Button>
            )}
          </div>

          <div className="my-5 h-px bg-border-divider" aria-hidden />

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
              Finding
            </span>
            <span className="font-display text-[11px] uppercase tracking-[0.18em] text-accent-text">
              Worthy Challenger
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
