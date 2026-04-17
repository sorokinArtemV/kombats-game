import { useState, useEffect } from 'react';
import { Button } from '@/ui/components/Button';
import { SearchingIndicator } from '../components/SearchingIndicator';
import { useMatchmaking, useMatchmakingPolling } from '../hooks';

export function SearchingScreen() {
  const {
    status,
    searchStartedAt,
    consecutiveFailures,
    leaveQueue,
  } = useMatchmaking();
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  // Start polling lifecycle
  useMatchmakingPolling();

  // Elapsed time counter
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
      ? 'Opponent found — preparing battle...'
      : status === 'battleTransition'
        ? 'Entering battle...'
        : 'Searching for opponent...';

  const canCancel = status === 'searching' || status === 'matched';

  return (
    <div className="flex flex-col items-center gap-8 pt-16">
      <SearchingIndicator />

      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-medium text-text-primary">{statusText}</p>
        {status === 'searching' && (
          <p className="font-mono text-sm text-text-muted">{timeDisplay}</p>
        )}
      </div>

      {consecutiveFailures >= 3 && (
        <p className="text-xs text-warning">
          Connection issues — retrying...
        </p>
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
    </div>
  );
}
