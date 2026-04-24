import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '../store';

// DESIGN_REFERENCE.md §5.18 — soft elliptical black halo behind the name so
// text stays legible over bright scene art. Cannot be expressed as a Tailwind
// utility (elliptical radial-gradient + 22 px blur).
const halo: React.CSSProperties = {
  inset: '-38px -56px',
  background:
    'radial-gradient(ellipse 68% 62% at center, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 48%, rgba(0,0,0,0) 88%)',
  filter: 'blur(22px)',
};

// DESIGN_REFERENCE.md §5.18 — double black drop-shadow on the display name.
const nameShadow: React.CSSProperties = {
  textShadow:
    '0 2px 8px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.7)',
};

// DESIGN_REFERENCE.md §3.18 — color-mix KPI tile tint.
function tileStyle(tone: 'jade' | 'crimson'): React.CSSProperties {
  const toneVar = tone === 'jade' ? 'var(--color-kombats-jade)' : 'var(--color-kombats-crimson)';
  return {
    background: `color-mix(in srgb, ${toneVar} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${toneVar} 30%, transparent)`,
  };
}

/**
 * Lobby-side fighter nameplate — reads from the player's own character +
 * players/:id/card query. Expandable stats popover opens upward.
 * DESIGN_REFERENCE.md §5.18 (nameplate) + §5.12 (stats popover).
 */
export function FighterNameplate() {
  const character = usePlayerStore((s) => s.character);
  const userIdentityId = useAuthStore((s) => s.userIdentityId);
  const [open, setOpen] = useState(false);

  const cardQuery = useQuery({
    queryKey: playerKeys.card(userIdentityId ?? ''),
    queryFn: () => playersApi.getCard(userIdentityId!),
    enabled: !!userIdentityId,
    staleTime: 30_000,
  });

  if (!character) return null;

  const wins = cardQuery.data?.wins ?? 0;
  const losses = cardQuery.data?.losses ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div className="relative w-[280px]">
      <AnimatePresence>
        {open && (
          <motion.div
            key="popover"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 right-0 mb-3 overflow-hidden rounded-md border-[0.5px] border-border-subtle bg-glass shadow-[var(--shadow-panel)] backdrop-blur-[20px]"
          >
            <div className="flex items-center justify-between border-b-[0.5px] border-border-divider px-4 py-2.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
                Fighter Profile
              </span>
              <span className="font-display text-[11px] uppercase tracking-[0.18em] text-accent-text">
                Lv {character.level}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-text-muted">
                  Attributes
                </span>
                <AttrRow tone="crimson" label="Strength" value={character.strength} />
                <AttrRow tone="gold" label="Agility" value={character.agility} />
                <AttrRow tone="jade" label="Intuition" value={character.intuition} />
                <AttrRow tone="silver" label="Vitality" value={character.vitality} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-text-muted">
                  Record
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <div
                    className="flex flex-col items-center rounded-sm py-1.5"
                    style={tileStyle('jade')}
                  >
                    <span className="text-[9px] uppercase tracking-[0.2em] text-text-muted">
                      Wins
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-kombats-jade-light">
                      {wins}
                    </span>
                  </div>
                  <div
                    className="flex flex-col items-center rounded-sm py-1.5"
                    style={tileStyle('crimson')}
                  >
                    <span className="text-[9px] uppercase tracking-[0.2em] text-text-muted">
                      Losses
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-kombats-crimson-light">
                      {losses}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-text-muted">Win Rate</span>
                  <span className="font-semibold tabular-nums text-accent-text">
                    {total > 0 ? `${winRate}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div aria-hidden className="pointer-events-none absolute" style={halo} />

      <div className="relative flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-accent-text">
            Lv {character.level}
          </span>
          <h2
            className="truncate font-display text-2xl font-semibold uppercase tracking-[0.1em] text-text-primary"
            style={nameShadow}
          >
            {character.name ?? 'Unknown'}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Hide fighter stats' : 'Show fighter stats'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-kombats-moon-silver transition-colors duration-150 hover:text-accent-text focus:outline-none focus-visible:text-accent-text"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.9))' }}
        >
          <Chevron open={open} />
        </button>
      </div>
    </div>
  );
}

function AttrRow({
  tone,
  label,
  value,
}: {
  tone: 'crimson' | 'gold' | 'jade' | 'silver';
  label: string;
  value: number;
}) {
  const toneVar =
    tone === 'crimson'
      ? 'var(--color-kombats-crimson)'
      : tone === 'gold'
        ? 'var(--color-kombats-gold)'
        : tone === 'jade'
          ? 'var(--color-kombats-jade)'
          : 'var(--color-kombats-moon-silver)';
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-2 text-text-secondary">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: toneVar }}
        />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="transition-transform duration-200"
      style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}
