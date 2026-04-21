import { useState, useEffect } from 'react';
import { Button } from '@/ui/components/Button';
import { SearchingIndicator } from '../components/SearchingIndicator';
import { useMatchmaking, useMatchmakingPolling } from '../hooks';
import { CharacterPortraitCard } from '@/modules/player/components/CharacterPortraitCard';

export function SearchingScreen() {
  const {
    status,
    searchStartedAt,
    consecutiveFailures,
    leaveQueue,
  } = useMatchmaking();
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);

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

  const statusText =
    status === 'matched'
      ? 'Opponent found — preparing battle…'
      : status === 'battleTransition'
        ? 'Entering battle…'
        : 'Searching for opponent…';

  const canCancel = status === 'searching' || status === 'matched';

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      <CharacterPortraitCard />

      <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto rounded-md border border-border bg-bg-secondary p-8">
        <SearchingIndicator />

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="font-display text-xl font-semibold text-text-primary">
            {statusText}
          </p>
          {status === 'searching' && (
            <p className="font-mono text-sm text-text-muted">{timeDisplay}</p>
          )}
        </div>

        {consecutiveFailures >= 3 && (
          <p className="text-xs text-warning">Connection issues — retrying…</p>
        )}

        {canCancel && (
          <Button
            variant="secondary"
            onClick={handleCancel}
            loading={cancelling}
            disabled={cancelling}
          >
            Cancel
          </Button>
        )}
      </section>
    </div>
  );
}
