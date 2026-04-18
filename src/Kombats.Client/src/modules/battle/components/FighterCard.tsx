import { clsx } from 'clsx';
import { Badge } from '@/ui/components/Badge';
import {
  StatList,
  Divider,
  HpRow,
  PortraitGlyph,
} from '@/modules/player/components/CharacterPortraitCard';

export type FighterTone = 'friendly' | 'hostile';

interface FighterCardProps {
  name: string;
  level?: number | null;
  tone: FighterTone;
  hp: number | null;
  maxHp: number | null;
  stats: ReadonlyArray<readonly [string, number]>;
  statusLabel?: string;
  statusVariant?: 'success' | 'warning' | 'default';
  ratingLabel?: string | null;
}

const portraitBg: Record<FighterTone, string> = {
  friendly: 'bg-portrait-friendly',
  hostile: 'bg-portrait-hostile',
};

const portraitGlyphBg: Record<FighterTone, string> = {
  friendly: 'bg-accent-strong',
  hostile: 'bg-error',
};

/**
 * Battle-screen fighter card — 340px wide. Larger portrait than the lobby
 * card with the player name overlaid, then HP + stats + status row.
 */
export function FighterCard({
  name,
  level,
  tone,
  hp,
  maxHp,
  stats,
  statusLabel,
  statusVariant = 'default',
  ratingLabel,
}: FighterCardProps) {
  return (
    <article className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-md border border-border bg-bg-secondary">
      <div
        className={clsx(
          'relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden',
          portraitBg[tone],
        )}
      >
        <div
          className={clsx(
            'flex h-[180px] w-[180px] items-center justify-center rounded-full border-4 border-bg-secondary text-white',
            portraitGlyphBg[tone],
          )}
        >
          <PortraitGlyph />
        </div>
        <div className="absolute left-3 right-3 top-3">
          <p className="truncate font-display text-base font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {name}
          </p>
          {level !== null && level !== undefined && (
            <p className="text-xs text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              Level {level}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <HpRow current={hp} max={maxHp} tone={tone} />
        <Divider />
        <StatList stats={stats} />
        {(statusLabel || ratingLabel) && (
          <>
            <Divider />
            <div className="flex items-center justify-center gap-2">
              {statusLabel && (
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              )}
              {ratingLabel && (
                <span className="inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-text-secondary">
                  {ratingLabel}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
