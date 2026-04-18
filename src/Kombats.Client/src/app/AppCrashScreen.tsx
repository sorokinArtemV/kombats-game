import { useBattleStore } from '@/modules/battle/store';
import { selectRecoveryTarget } from './crash-recovery';

// Shown by the top-level ErrorBoundary (and the per-group route errorElements)
// when a render throws. In-memory state may be corrupt, so recovery always
// goes through a hard `window.location.assign` — that triggers a fresh
// bootstrap (auth silent-restore, GameStateLoader, hub re-connects). If the
// user was in a battle, we preserve that battleId in the URL so BattleGuard
// and BattleStateUpdated can reconcile them back into their match; otherwise
// we land them on the lobby.

function goTo(path: string): void {
  window.location.assign(path);
}

export function AppCrashScreen() {
  // Snapshot read — this component is rendered in the error state, which is a
  // terminal UI, so we don't need reactive subscription.
  const battleState = useBattleStore.getState();
  const { label, href, inBattle } = selectRecoveryTarget(
    battleState.battleId,
    battleState.phase,
  );

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-primary px-6 text-center text-text-primary"
    >
      <div className="flex flex-col items-center gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-[0.2em]">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-text-muted">
          {inBattle
            ? 'The app hit an unexpected error. Your battle is still live on the server — rejoin to continue.'
            : 'The app hit an unexpected error. Return to the lobby to continue.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(href)}
          className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md border border-accent px-6 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
