import { Outlet } from 'react-router';
import { useGameState } from '@/modules/player/hooks';

export function GameStateLoader() {
  const { isPending, isError, error, refetch } = useGameState();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-secondary">Loading game state...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-primary">
        <p className="text-error">Failed to load game state</p>
        <p className="text-sm text-text-muted">
          {(error as Error)?.message ?? 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => refetch()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return <Outlet />;
}
