import { useState, useEffect } from 'react';
import { Button } from '@/ui/components/Button';
import { SearchingIndicator } from '../components/SearchingIndicator';
import { useMatchmaking, useMatchmakingPolling } from '../hooks';
import { FighterNameplate } from '@/modules/player/components/FighterNameplate';
import { usePlayerStore } from '@/modules/player/store';
import { getAvatarAsset } from '@/modules/player/avatar-assets';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';

// DESIGN_REFERENCE.md §1.3 — identical to LobbyScreen so the search state
// reads as a center-overlay swap, not a scene change.
const sceneOverlayStyle: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, transparent 0%, rgba(var(--rgb-ink-navy), 0.30) 60%, rgba(var(--rgb-ink-navy), 0.60) 100%)',
};

// DESIGN_REFERENCE.md §3.16 — oversized sprite drop shadow.
const spriteStyle: React.CSSProperties = {
  filter: 'drop-shadow(0 25px 50px rgba(var(--rgb-black), 0.9))',
  marginBottom: '-17vh',
};

/**
 * Queue search screen — pixel-identical to LobbyScreen with the centered
 * QueueCard swapped to its searching variant (DESIGN_REFERENCE.md §5.10).
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

      <div className="pointer-events-none absolute bottom-0 left-0 z-10 flex flex-col items-center">
        <div className="pointer-events-auto">
          <FighterNameplate />
        </div>
        <img
          src={getAvatarAsset(character?.avatarId)}
          alt=""
          aria-hidden
          className="pointer-events-none h-[82vh] w-auto object-contain"
          style={spriteStyle}
        />
      </div>

      <div
        className="absolute left-1/2 top-1/2 z-20 w-80 max-w-[calc(100%-3rem)]"
        style={{ transform: 'translate(-50%, -55%)' }}
      >
        <SearchingCard
          status={status}
          elapsedSeconds={elapsed}
          consecutiveFailures={consecutiveFailures}
          cancelling={cancelling}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}

interface SearchingCardProps {
  status: ReturnType<typeof useMatchmaking>['status'];
  elapsedSeconds: number;
  consecutiveFailures: number;
  cancelling: boolean;
  onCancel: () => void;
}

/**
 * DESIGN_REFERENCE.md §5.10 (searching state). Glass panel mirroring the
 * lobby QueueCard geometry with a Mitsudomoe spinner, elapsed timer, cancel
 * action, and the same Finding / Worthy Challenger footer.
 */
function SearchingCard({
  status,
  elapsedSeconds,
  consecutiveFailures,
  cancelling,
  onCancel,
}: SearchingCardProps) {
  const title =
    status === 'matched'
      ? 'Opponent Found'
      : status === 'battleTransition'
        ? 'Entering Battle'
        : 'Searching for Opponent';
  const showElapsed = status === 'searching';
  const canCancel = status === 'searching' || status === 'matched';

  return (
    <section className="rounded-md border-[0.5px] border-border-subtle bg-glass shadow-[var(--shadow-panel)] backdrop-blur-[20px]">
      <div className="p-6">
        <div className="mb-4 px-0 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-accent-text">
          {title}
        </div>

        <div className="mb-4 flex justify-center">
          <SearchingIndicator />
        </div>

        {showElapsed && (
          <div
            className="mb-4 flex items-center justify-center gap-2 text-text-secondary"
            aria-live="polite"
          >
            <ClockIcon />
            <span className="text-[18px] tabular-nums">{elapsedSeconds}s</span>
          </div>
        )}

        {consecutiveFailures >= 3 && (
          <p
            className="mb-4 text-center text-[11px] uppercase tracking-[0.18em] text-kombats-crimson-light"
            role="alert"
          >
            Connection issues — retrying…
          </p>
        )}

        {canCancel && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="lg"
              onClick={onCancel}
              loading={cancelling}
              disabled={cancelling}
            >
              Cancel Search
            </Button>
          </div>
        )}

        <div className="my-4 border-t border-border-divider" aria-hidden />

        <div className="text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
            Finding
          </span>
          <span className="mt-1 block text-[16px] font-medium uppercase tracking-[0.08em] text-accent-text">
            Worthy Challenger
          </span>
        </div>
      </div>
    </section>
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
