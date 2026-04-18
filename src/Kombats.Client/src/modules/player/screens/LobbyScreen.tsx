import { useState } from 'react';
import { CharacterPortraitCard, StatList, Divider } from '../components/CharacterPortraitCard';
import { StatAllocationPanel } from '../components/StatAllocationPanel';
import { LevelUpBanner } from '../components/LevelUpBanner';
import { QueueButton } from '@/modules/matchmaking/components/QueueButton';
import { usePlayerStore } from '../store';
import { usePostBattleRefresh } from '../post-battle-refresh';

export function LobbyScreen() {
  // Runs once per post-battle return. Refetches game state, retries after
  // 3s if XP/level still stale (DEC-5), and surfaces a level-up banner
  // when applicable.
  usePostBattleRefresh();

  const character = usePlayerStore((s) => s.character);
  const hasUnspentPoints = (character?.unspentPoints ?? 0) > 0;

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      <CharacterPortraitCard />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-secondary">
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
          {hasUnspentPoints ? (
            <div className="flex w-full max-w-xl flex-col gap-4">
              <LevelUpBanner />
              <StatAllocationPanel />
            </div>
          ) : (
            <ReadyForCombatPanel character={character} />
          )}
        </div>
      </section>
    </div>
  );
}

function ReadyForCombatPanel({
  character,
}: {
  character: ReturnType<typeof usePlayerStore.getState>['character'];
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-display text-2xl font-semibold text-text-primary">
          Ready for Combat
        </h1>
        <p className="text-sm text-text-muted">
          Join the queue to find an opponent
        </p>
      </header>

      <div className="w-full">
        <QueueButton />
      </div>

      <SecondaryActions />

      {character && (
        <div className="flex w-full flex-col gap-2 rounded-md bg-bg-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Current Build
          </p>
          <Divider />
          <StatList
            stats={[
              ['Strength', character.strength],
              ['Agility', character.agility],
              ['Intuition', character.intuition],
              ['Vitality', character.vitality],
            ]}
          />
        </div>
      )}
    </div>
  );
}

function SecondaryActions() {
  const [active, setActive] = useState<'player' | 'character' | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <SecondaryButton
        active={active === 'player'}
        onClick={() => setActive((v) => (v === 'player' ? null : 'player'))}
      >
        <PlayerIcon /> Player Settings
      </SecondaryButton>
      <SecondaryButton
        active={active === 'character'}
        onClick={() => setActive((v) => (v === 'character' ? null : 'character'))}
      >
        <CharacterIcon /> Character Settings
      </SecondaryButton>
      {active && (
        <p className="w-full text-center text-xs text-text-muted">
          {active === 'player' ? 'Player' : 'Character'} settings coming soon.
        </p>
      )}
    </div>
  );
}

function SecondaryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ' +
        (active
          ? 'border-accent text-accent'
          : 'border-border-strong text-text-secondary hover:border-accent hover:text-accent')
      }
    >
      {children}
    </button>
  );
}

function PlayerIcon() {
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
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CharacterIcon() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
