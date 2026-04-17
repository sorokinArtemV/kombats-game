import { useQuery } from '@tanstack/react-query';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '../store';
import { levelProgress } from '../leveling';
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import { ProgressBar } from '@/ui/components/ProgressBar';

export function CharacterSummary() {
  const character = usePlayerStore((s) => s.character);
  const userIdentityId = useAuthStore((s) => s.userIdentityId);

  const playerCardQuery = useQuery({
    queryKey: playerKeys.card(userIdentityId ?? ''),
    queryFn: () => playersApi.getCard(userIdentityId!),
    enabled: !!userIdentityId,
    staleTime: 30_000,
  });

  if (!character) return null;

  const xp = levelProgress(character.level, character.totalXp);
  const wins = playerCardQuery.data?.wins ?? 0;
  const losses = playerCardQuery.data?.losses ?? 0;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-text-primary">
              {character.name ?? 'Unknown'}
            </h2>
            <p className="text-sm text-text-muted">Level {character.level}</p>
          </div>
          {character.unspentPoints > 0 && (
            <Badge variant="warning">{character.unspentPoints} unspent</Badge>
          )}
        </div>

        {/* XP bar */}
        <ProgressBar
          value={xp.current}
          max={xp.needed}
          label="Experience"
          showText
          colorClass="bg-accent"
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatRow label="Strength" value={character.strength} />
          <StatRow label="Agility" value={character.agility} />
          <StatRow label="Intuition" value={character.intuition} />
          <StatRow label="Vitality" value={character.vitality} />
        </div>

        {/* Win/Loss record */}
        <div className="flex items-center gap-4 border-t border-bg-surface pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Wins</span>
            <span className="text-sm font-medium text-success">{wins}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Losses</span>
            <span className="text-sm font-medium text-error">{losses}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-primary px-3 py-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-mono text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}
