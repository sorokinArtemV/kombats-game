import { usePlayerCard } from '../hooks';
import { Sheet } from '@/ui/components/Sheet';
import { Spinner } from '@/ui/components/Spinner';
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

// Cinzel name bloom matching DESIGN_REFERENCE.md §3.4 — gold halo behind
// the display name.
const nameBloomStyle = {
  textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
};

export function PlayerCard({ playerId, open, onClose }: PlayerCardProps) {
  const { data, isPending, isError, error } = usePlayerCard(playerId, open);

  return (
    <Sheet open={open} onClose={onClose} title="Player Profile">
      <div className="px-5 py-5">
        {isPending && (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        )}

        {isError && (
          <p className="py-10 text-center text-sm text-kombats-crimson-light">
            {getErrorMessage(error)}
          </p>
        )}

        {data && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-2 border-b-[0.5px] border-border-divider pb-5">
              <h3
                className="font-display text-[22px] font-semibold uppercase tracking-[0.20em] text-kombats-gold"
                style={nameBloomStyle}
              >
                {data.displayName}
              </h3>
              <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                Level {data.level}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-muted">
                Attributes
              </p>
              <div className="grid grid-cols-2 gap-2">
                <StatRow label="Strength" value={data.strength} />
                <StatRow label="Agility" value={data.agility} />
                <StatRow label="Intuition" value={data.intuition} />
                <StatRow label="Vitality" value={data.vitality} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-text-muted">
                Record
              </p>
              <div className="grid grid-cols-2 gap-2">
                <KpiTile label="Wins" value={data.wins} tone="jade" />
                <KpiTile label="Losses" value={data.losses} tone="crimson" />
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
    <div className="flex items-center justify-between rounded-sm border-[0.5px] border-border-subtle bg-glass-subtle px-3 py-2">
      <span className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'jade' | 'crimson';
}) {
  const colorVar =
    tone === 'jade' ? 'var(--color-kombats-jade)' : 'var(--color-kombats-crimson)';
  return (
    <div
      className="flex flex-col gap-1 rounded-sm border-[0.5px] px-3 py-2"
      style={{
        background: `color-mix(in srgb, ${colorVar} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${colorVar} 35%, transparent)`,
      }}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
      <span
        className="text-lg font-semibold tabular-nums"
        style={{ color: colorVar }}
      >
        {value}
      </span>
    </div>
  );
}
