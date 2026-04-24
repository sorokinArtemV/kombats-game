import { useState } from 'react';
import { useMatchmaking } from '../hooks';
import { Spinner } from '@/ui/components/Spinner';
import { isApiError } from '@/types/api';

export function QueueButton() {
  const { status, joinQueue } = useMatchmaking();
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleJoin = async () => {
    setJoining(true);
    setErrorMessage(null);
    try {
      await joinQueue();
    } catch (err: unknown) {
      setErrorMessage(extractMessage(err));
    } finally {
      setJoining(false);
    }
  };

  const disabled = status !== 'idle' || joining;

  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        onClick={handleJoin}
        disabled={disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-primary px-6 py-3 font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-text-on-accent transition-colors duration-150 hover:bg-kombats-gold-light disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent-primary"
      >
        {joining ? <Spinner size="sm" /> : <PlayIcon />}
        <span>{joining ? 'Joining…' : 'Join Queue'}</span>
      </button>
      {errorMessage && (
        <p
          className="text-center text-[11px] uppercase tracking-[0.18em] text-kombats-crimson-light"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function extractMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status >= 500) return 'Matchmaking is temporarily unavailable.';
    if (err.error?.message) return err.error.message;
  }
  return 'Could not join the queue. Please try again.';
}

function PlayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
