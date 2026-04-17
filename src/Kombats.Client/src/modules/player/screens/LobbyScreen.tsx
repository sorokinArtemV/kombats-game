import { CharacterSummary } from '../components/CharacterSummary';
import { StatAllocationPanel } from '../components/StatAllocationPanel';
import { LevelUpBanner } from '../components/LevelUpBanner';
import { QueueButton } from '@/modules/matchmaking/components/QueueButton';
import { usePostBattleRefresh } from '../post-battle-refresh';

export function LobbyScreen() {
  // Runs once per post-battle return. Refetches game state, retries after
  // 3s if XP/level still stale (DEC-5), and surfaces a level-up banner
  // when applicable.
  usePostBattleRefresh();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl text-text-primary">Lobby</h1>
      <div className="flex max-w-md flex-col gap-4">
        <LevelUpBanner />
        <CharacterSummary />
        <StatAllocationPanel />
      </div>
      <div>
        <QueueButton />
      </div>
    </div>
  );
}
