import { useState } from 'react';
import { useMatchmaking } from '../hooks';
import { Spinner } from '@/ui/components/Spinner';

export function QueueButton() {
  const { status, joinQueue } = useMatchmaking();
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinQueue();
    } finally {
      setJoining(false);
    }
  };

  const disabled = status !== 'idle' || joining;

  return (
    <button
      type="button"
      onClick={handleJoin}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-go px-6 py-3 text-base font-bold uppercase tracking-wide text-white shadow-md transition-colors hover:bg-go-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-go"
    >
      {joining ? <Spinner size="sm" /> : <PlayIcon />}
      <span>{joining ? 'Joining…' : 'Join Queue'}</span>
    </button>
  );
}

function PlayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
