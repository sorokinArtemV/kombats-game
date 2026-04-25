import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Sword, Zap, TrendingUp, Heart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { playerKeys } from '@/app/query-client';
import * as playersApi from '@/transport/http/endpoints/players';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '../store';
import { deriveMaxHp } from '../hp-formula';

// DESIGN_REFERENCE.md §5.18 — soft elliptical black halo behind the name so
// text stays legible over bright scene art. Cannot be expressed as a Tailwind
// utility (elliptical radial-gradient + 22 px blur).
const halo: React.CSSProperties = {
  inset: '-38px -56px',
  background:
    'radial-gradient(ellipse 68% 62% at center, rgba(var(--rgb-black), 0.62) 0%, rgba(var(--rgb-black), 0.38) 48%, rgba(var(--rgb-black), 0) 88%)',
  filter: 'blur(22px)',
};

// DESIGN_REFERENCE.md §5.18 — double black drop-shadow on the display name.
const nameShadow: React.CSSProperties = {
  textShadow:
    '0 2px 8px rgba(var(--rgb-black), 0.95), 0 0 20px rgba(var(--rgb-black), 0.7)',
};

// Chevron drop-shadow per design — softer (1px / 3px) than the battle FighterCard.
const chevronShadow: React.CSSProperties = {
  filter: 'drop-shadow(0 1px 3px rgba(var(--rgb-black), 0.9))',
};

// DESIGN_REFERENCE.md §3.18 — color-mix KPI tile tint.
function tileStyle(tone: 'jade' | 'crimson'): React.CSSProperties {
  const toneVar = tone === 'jade' ? 'var(--color-kombats-jade)' : 'var(--color-kombats-crimson)';
  return {
    background: `color-mix(in srgb, ${toneVar} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${toneVar} 30%, transparent)`,
  };
}

type AttrTone = 'crimson' | 'gold' | 'jade' | 'silver';

const ATTR_COLOR: Record<AttrTone, string> = {
  crimson: 'var(--color-kombats-crimson)',
  gold: 'var(--color-kombats-gold)',
  jade: 'var(--color-kombats-jade)',
  silver: 'var(--color-kombats-moon-silver)',
};

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

  const maxHp = deriveMaxHp(character.vitality);
  const hp = maxHp;

  return (
    <div className="relative z-20 mb-3 w-[420px] max-w-[calc(100vw-3rem)]">
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
            <div className="flex items-center justify-between border-b border-border-divider px-4 py-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
                Fighter Profile
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-kombats-gold">
                Lv {character.level}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 px-4 py-3">
              <div>
                <div className="mb-2 text-[9px] uppercase tracking-[0.05em] text-text-muted">
                  Attributes
                </div>
                <div className="flex flex-col gap-1.5">
                  <AttrRow icon={Sword} tone="crimson" label="Strength" value={character.strength} />
                  <AttrRow icon={Zap} tone="gold" label="Agility" value={character.agility} />
                  <AttrRow icon={TrendingUp} tone="jade" label="Intuition" value={character.intuition} />
                  <AttrRow icon={Heart} tone="silver" label="Vitality" value={character.vitality} />
                </div>
              </div>
              <div>
                <div className="mb-2 text-[9px] uppercase tracking-[0.05em] text-text-muted">
                  Record
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <KpiTile value={wins} label="Wins" tone="jade" />
                  <KpiTile value={losses} label="Losses" tone="crimson" />
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <AuxRow
                    label="Winrate"
                    value={total > 0 ? `${winRate}%` : '—'}
                    valueColor="var(--color-kombats-gold)"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div aria-hidden className="pointer-events-none absolute" style={halo} />

      <div className="relative">
        <div className="mb-2 flex">
          <h2
            className="text-2xl leading-none tracking-wide text-text-primary"
            style={nameShadow}
          >
            {character.name ?? 'Unknown'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <HpBar hp={hp} maxHp={maxHp} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide fighter stats' : 'Show fighter stats'}
            className="flex h-7 w-7 shrink-0 items-center justify-center text-kombats-moon-silver transition-colors duration-150 hover:text-kombats-gold focus:outline-none focus-visible:text-kombats-gold"
            style={chevronShadow}
          >
            <Chevron open={open} />
          </button>
        </div>
      </div>
    </div>
  );
}

// DESIGN_REFERENCE.md §3.11 — parallelogram HP bar with jade gradient fill.
// Matches design_V2/GameScreens.tsx lobby HpBar (non-mirrored variant).
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div
      className="relative h-7 flex-1"
      style={{
        clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
        background: 'rgba(var(--rgb-ink-navy), 0.75)',
        border: '0.5px solid rgba(var(--rgb-white), 0.08)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
        style={{
          width: `${pct}%`,
          background:
            'linear-gradient(180deg, var(--palette-hp-jade-1) 0%, var(--palette-hp-jade-2) 55%, var(--palette-hp-jade-3) 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{ background: 'rgba(var(--rgb-white), 0.22)' }}
        />
      </div>
      <span
        className="absolute inset-0 flex items-center justify-end font-display tabular-nums text-text-primary"
        style={{
          padding: '0 14px',
          fontStyle: 'italic',
          fontSize: 13,
          letterSpacing: '0.04em',
          fontFeatureSettings: '"tnum"',
          textShadow: 'var(--shadow-text-on-glass-strong)',
        }}
      >
        {hp}
        <span className="mx-[3px] opacity-55">/</span>
        {maxHp}
      </span>
    </div>
  );
}

function AttrRow({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: AttrTone;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color: ATTR_COLOR[tone] }} />
        <span className="text-[12px] text-text-secondary">{label}</span>
      </div>
      <span className="text-[12px] font-medium tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  );
}

function KpiTile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'jade' | 'crimson';
}) {
  const toneVar =
    tone === 'jade' ? 'var(--color-kombats-jade)' : 'var(--color-kombats-crimson)';
  return (
    <div
      className="rounded-sm py-1.5 text-center"
      style={tileStyle(tone)}
    >
      <div
        className="leading-none tabular-nums"
        style={{ fontSize: 18, color: toneVar }}
      >
        {value}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.05em] text-text-muted">
        {label}
      </div>
    </div>
  );
}

function AuxRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.05em]">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
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
