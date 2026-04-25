import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import type { PlayerCardResponse } from '@/types/player';

export type FighterTone = 'friendly' | 'hostile';
type HpColor = 'jade' | 'crimson';

interface FighterCardProps {
  name: string;
  level?: number | null;
  tone: FighterTone;
  hp: number | null;
  maxHp: number | null;
  card?: PlayerCardResponse | null;
  /**
   * Visually mirror the HP bar so it depletes right-to-left — used for the
   * opponent nameplate on the right edge of the screen. Does NOT flip any
   * underlying data; the numbers and percent calculation remain unchanged.
   */
  hpBarMirror?: boolean;
  /**
   * When true, align the whole nameplate contents to the right (opponent).
   */
  alignRight?: boolean;
}

// DESIGN_REFERENCE.md §5.18 — soft elliptical black halo behind name+HP so
// text stays legible over bright scene art.
const haloStyle: React.CSSProperties = {
  inset: '-38px -56px',
  background:
    'radial-gradient(ellipse 68% 62% at center, rgba(var(--rgb-black), 0.62) 0%, rgba(var(--rgb-black), 0.38) 48%, rgba(var(--rgb-black), 0) 88%)',
  filter: 'blur(22px)',
};

const nameShadow: React.CSSProperties = {
  textShadow: '0 2px 8px rgba(var(--rgb-black), 0.95), 0 0 20px rgba(var(--rgb-black), 0.7)',
};

function tileStyle(t: 'jade' | 'crimson'): React.CSSProperties {
  const toneVar =
    t === 'jade' ? 'var(--color-kombats-jade)' : 'var(--color-kombats-crimson)';
  return {
    background: `color-mix(in srgb, ${toneVar} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${toneVar} 30%, transparent)`,
  };
}

/**
 * Battle-screen fighter nameplate. Sits over the sprite at the bottom of the
 * screen. Tone dictates the HP color (jade for self, crimson for opponent)
 * and the stats popover accent. `hpBarMirror` visually flips the HP bar
 * parallelogram so the opponent's health depletes right-to-left while the
 * underlying percentage remains truthful.
 *
 * DESIGN_REFERENCE.md §5.18 (nameplate) + §3.11 (HP bar) + §5.12 (stats popover).
 */
export function FighterCard({
  name,
  level,
  tone,
  hp,
  maxHp,
  card,
  hpBarMirror = false,
  alignRight = false,
}: FighterCardProps) {
  const [open, setOpen] = useState(false);
  const hpColor: HpColor = tone === 'friendly' ? 'jade' : 'crimson';

  const wins = card?.wins ?? 0;
  const losses = card?.losses ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div
      className={clsx(
        'relative w-[320px] sm:w-[360px]',
        alignRight && 'text-right',
      )}
    >
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
            <div
              className={clsx(
                'flex items-center justify-between border-b-[0.5px] border-border-divider px-4 py-2.5',
                alignRight && 'flex-row-reverse',
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
                Fighter Profile
              </span>
              <span className="font-display text-[11px] uppercase tracking-[0.18em] text-accent-text">
                Lv {level ?? '—'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 text-left">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-text-muted">
                  Attributes
                </span>
                <AttrRow tone="crimson" label="Strength" value={card?.strength ?? 0} />
                <AttrRow tone="gold" label="Agility" value={card?.agility ?? 0} />
                <AttrRow tone="jade" label="Intuition" value={card?.intuition ?? 0} />
                <AttrRow tone="silver" label="Vitality" value={card?.vitality ?? 0} />
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

      <div aria-hidden className="pointer-events-none absolute" style={haloStyle} />

      <div className="relative flex flex-col gap-2">
        <div
          className={clsx(
            'flex items-end gap-3',
            alignRight && 'flex-row-reverse',
          )}
        >
          <div
            className={clsx(
              'flex min-w-0 flex-col gap-1',
              alignRight && 'items-end',
            )}
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-accent-text">
              Lv {level ?? '—'}
            </span>
            <h2
              className="truncate font-display text-2xl font-semibold uppercase tracking-[0.1em] text-text-primary"
              style={nameShadow}
            >
              {name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide fighter stats' : 'Show fighter stats'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-kombats-moon-silver transition-colors duration-150 hover:text-accent-text focus:outline-none focus-visible:text-accent-text"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(var(--rgb-black), 0.9))' }}
          >
            <Chevron open={open} />
          </button>
        </div>

        <HpBar hp={hp} maxHp={maxHp} color={hpColor} mirror={hpBarMirror} />
      </div>
    </div>
  );
}

// DESIGN_REFERENCE.md §3.11 — parallelogram HP bar with mirrorable clip-path.
interface HpBarProps {
  hp: number | null;
  maxHp: number | null;
  color: HpColor;
  mirror: boolean;
}

function HpBar({ hp, maxHp, color, mirror }: HpBarProps) {
  const safeHp = hp ?? 0;
  const safeMax = maxHp ?? 0;
  const pct = safeMax > 0 ? Math.max(0, Math.min(100, (safeHp / safeMax) * 100)) : 0;

  const skewLeft = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
  const skewRight = 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 12px 100%)';

  const fillBackground =
    color === 'crimson'
      ? 'linear-gradient(180deg, var(--palette-hp-crimson-1) 0%, var(--palette-hp-crimson-2) 55%, var(--palette-hp-crimson-3) 100%)'
      : 'linear-gradient(180deg, var(--palette-hp-jade-1) 0%, var(--palette-hp-jade-2) 55%, var(--palette-hp-jade-3) 100%)';

  return (
    <div
      className="relative h-7 w-full"
      style={{
        clipPath: mirror ? skewRight : skewLeft,
        background: 'rgba(var(--rgb-ink-navy), 0.75)',
        border: '0.5px solid rgba(var(--rgb-white), 0.08)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: mirror ? 'auto' : 0,
          right: mirror ? 0 : 'auto',
          width: `${pct}%`,
          background: fillBackground,
          transition: 'width 300ms ease-out',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 1,
            left: mirror ? 0 : 'auto',
            right: mirror ? 'auto' : 0,
            background: 'rgba(var(--rgb-white), 0.22)',
          }}
        />
      </div>
      <span
        className="absolute inset-0 flex items-center font-display"
        style={{
          justifyContent: mirror ? 'flex-start' : 'flex-end',
          padding: '0 14px',
          fontStyle: 'italic',
          fontSize: 13,
          letterSpacing: '0.04em',
          fontFeatureSettings: '"tnum"',
          color: 'var(--color-text-primary)',
          textShadow: 'var(--shadow-text-on-glass-strong)',
        }}
      >
        {safeHp} / {safeMax}
      </span>
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
