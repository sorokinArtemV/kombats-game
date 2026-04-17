import { CharacterSummary } from '../components/CharacterSummary';
import { QueueButton } from '@/modules/matchmaking/components/QueueButton';

export function LobbyScreen() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl text-text-primary">Lobby</h1>
      <div className="max-w-md">
        <CharacterSummary />
      </div>
      <div>
        <QueueButton />
      </div>
    </div>
  );
}
