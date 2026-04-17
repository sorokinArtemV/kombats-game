import { useBattlePhase } from '../hooks';
import { useBattleStore } from '../store';
import { BattleHud } from '../components/BattleHud';
import { ZoneSelector } from '../components/ZoneSelector';
import { TurnResultPanel } from '../components/TurnResultPanel';
import { NarrationFeed } from '../components/NarrationFeed';
import { BattleEndOverlay } from '../components/BattleEndOverlay';
import { Spinner } from '@/ui/components/Spinner';

/**
 * Battle lifecycle (connect/disconnect, store reset) is owned by
 * `BattleShell` so the battle store survives navigation between
 * `/battle/:battleId` and `/battle/:battleId/result` (Phase 8 hand-off).
 */
export function BattleScreen() {
  const phase = useBattlePhase();
  const lastError = useBattleStore((s) => s.lastError);

  const isLoading =
    phase === 'Idle' || phase === 'Connecting' || phase === 'WaitingForJoin';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BattleHud />

      <div className="flex flex-1 flex-col gap-4 px-6 py-4 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {phase === 'Error' && lastError && (
            <div className="rounded-lg border border-error bg-error/10 px-4 py-3 text-sm text-error">
              {lastError}
            </div>
          )}

          {phase === 'ConnectionLost' && (
            <div className="rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-warning">
              Connection lost — reconnecting…
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              <ZoneSelector />
              <TurnResultPanel />
            </>
          )}
        </section>

        <aside className="flex min-h-0 w-full flex-col lg:w-80">
          <NarrationFeed />
        </aside>
      </div>

      <BattleEndOverlay />
    </div>
  );
}
