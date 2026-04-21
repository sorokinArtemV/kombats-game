import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '../store';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { Badge } from '@/ui/components/Badge';

const PORTRAIT_SIZE = 'h-[140px] w-[140px]';

/**
 * Lobby player card — 340px wide, portrait block on top, stats panel below.
 * Mirrors the design's left-hand player card composition.
 */
export function CharacterPortraitCard() {
  const character = usePlayerStore((s) => s.character);
  const userIdentityId = useAuthStore((s) => s.userIdentityId);

  const playerCardQuery = useQuery({
    queryKey: playerKeys.card(userIdentityId ?? ''),
    queryFn: () => playersApi.getCard(userIdentityId!),
    enabled: !!userIdentityId,
    staleTime: 30_000,
  });

  if (!character) return null;

  const wins = playerCardQuery.data?.wins ?? 0;
  const losses = playerCardQuery.data?.losses ?? 0;

  return (
    <article className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-md border border-border bg-bg-secondary">
      <div className="flex items-center justify-center bg-portrait-friendly py-6">
        <div
          className={clsx(
            'flex items-center justify-center rounded-full border-[3px] border-bg-secondary bg-accent-strong text-white',
            PORTRAIT_SIZE,
          )}
        >
          <PortraitGlyph />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {character.name ?? 'Unknown'}
          </h2>
          <div className="flex gap-2">
            <Badge variant="default">Level {character.level}</Badge>
          </div>
        </div>

        <StatList
          stats={[
            ['Strength', character.strength],
            ['Agility', character.agility],
            ['Intuition', character.intuition],
            ['Vitality', character.vitality],
          ]}
        />

        <Divider />

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Wins</span>
          <span className="font-semibold text-success">{wins}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Losses</span>
          <span className="font-semibold text-error">{losses}</span>
        </div>
      </div>
    </article>
  );
}

export function StatList({ stats }: { stats: ReadonlyArray<readonly [string, number]> }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {stats.map(([label, value]) => (
        <li
          key={label}
          className="flex items-center justify-between text-xs text-text-secondary"
        >
          <span className="text-text-muted">{label}</span>
          <span className="font-semibold text-text-primary">{value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Divider() {
  return <div className="h-px bg-border" aria-hidden />;
}

export function RatingChip({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-text-secondary">
      {rating}
    </span>
  );
}

export function HpRow({
  current,
  max,
  tone = 'friendly',
}: {
  current: number | null;
  max: number | null;
  tone?: 'friendly' | 'hostile';
}) {
  const ready = current !== null && max !== null && max > 0;
  const ratio = ready ? current / max : 0;
  const color = ready ? hpColor(ratio) : 'bg-bg-surface';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-text-primary">Health</span>
        <span className="font-mono text-text-secondary">
          {ready ? `${current}/${max}` : '— / —'}
        </span>
      </div>
      <ProgressBar
        value={ready ? current! : 1}
        max={ready ? max! : 1}
        colorClass={color}
        className={tone === 'hostile' ? 'tone-hostile' : undefined}
      />
    </div>
  );
}

function hpColor(ratio: number): string {
  if (ratio > 0.5) return 'bg-hp-high';
  if (ratio > 0.25) return 'bg-hp-medium';
  return 'bg-hp-low';
}

export function PortraitGlyph() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
