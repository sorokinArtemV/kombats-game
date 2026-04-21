import { usePlayerCard } from '../hooks';
import { Sheet } from '@/ui/components/Sheet';
import { Spinner } from '@/ui/components/Spinner';
import { Avatar } from '@/ui/components/Avatar';
import type { ApiError } from '@/types/api';

interface PlayerCardProps {
  playerId: string;
  open: boolean;
  onClose: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as ApiError;
    if (apiError.status === 404) return 'Player not found';
  }
  return "Couldn't load profile";
}

export function PlayerCard({ playerId, open, onClose }: PlayerCardProps) {
  const { data, isPending, isError, error } = usePlayerCard(playerId, open);

  return (
    <Sheet open={open} onClose={onClose} title="Player Profile">
      <div className="p-4">
        {isPending && (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        )}

        {isError && (
          <p className="py-8 text-center text-sm text-error">{getErrorMessage(error)}</p>
        )}

        {data && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={data.displayName} size="lg" />
              <div>
                <h3 className="font-display text-lg text-text-primary">{data.displayName}</h3>
                <p className="text-sm text-text-muted">Level {data.level}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatRow label="Strength" value={data.strength} />
              <StatRow label="Agility" value={data.agility} />
              <StatRow label="Intuition" value={data.intuition} />
              <StatRow label="Vitality" value={data.vitality} />
            </div>

            <div className="flex items-center gap-4 border-t border-bg-surface pt-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">Wins</span>
                <span className="text-sm font-medium text-success">{data.wins}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">Losses</span>
                <span className="text-sm font-medium text-error">{data.losses}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-secondary px-3 py-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-mono text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}
