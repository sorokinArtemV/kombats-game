import { Navigate, useNavigate, useParams } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/modules/auth/store';
import { usePlayerStore } from '@/modules/player/store';
import { useBattleStore } from '../store';
import { useBattlePhase, useBattleResult } from '../hooks';
import { deriveOutcome, type BattleEndOutcome } from '../battle-end-outcome';
import { useResultBattleFeed } from '../result-feed';
import { END_OF_BATTLE_TURN_INDEX } from '../feed-merge';
import { Spinner } from '@/ui/components/Spinner';
import bgScene from '@/ui/assets/backgrounds/bg-1.png';
import type { BattleFeedEntry } from '@/types/battle';

// DESIGN_REFERENCE.md §3.5 — 24 alternating gold beams, repeating every 30°.
// Built once at module load; the motion.div wraps this for the 60s rotation.
const VICTORY_RAYS_BACKGROUND = (() => {
  const stops: string[] = [];
  for (let i = 0; i < 12; i++) {
    const base = i * 30;
    stops.push(`rgba(var(--rgb-gold-victory), 0.22) ${base}deg ${base + 8}deg`);
    stops.push(`transparent ${base + 8}deg ${base + 15}deg`);
    stops.push(`rgba(var(--rgb-gold-victory), 0.18) ${base + 15}deg ${base + 23}deg`);
    stops.push(`transparent ${base + 23}deg ${base + 30}deg`);
  }
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
})();

const VICTORY_RAYS_MASK = 'radial-gradient(circle, black 15%, transparent 40%)';

// DESIGN_REFERENCE.md §1.6 — overall scene darkening for victory (heavier so
// the ceremonial gold reads cleanly).
const VICTORY_OVERLAY: React.CSSProperties = {
  background: 'rgba(var(--rgb-black), 0.65)',
};

// DESIGN_REFERENCE.md §1.7 — lighter overlay so the red vignette/slashes read.
const DEFEAT_OVERLAY: React.CSSProperties = {
  background: 'rgba(var(--rgb-black), 0.5)',
};

// DESIGN_REFERENCE.md §3.7 — red closing-in vignette.
const DEFEAT_VIGNETTE: React.CSSProperties = {
  background:
    'radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(var(--rgb-crimson), 0.12) 55%, rgba(var(--rgb-crimson), 0.25) 85%)',
};

// DESIGN_REFERENCE.md §3.6 — two-layer bloom at the title position.
const VICTORY_GOLD_BLOOM: React.CSSProperties = {
  background:
    'radial-gradient(circle, rgba(var(--rgb-gold-victory), 0.15) 0%, rgba(var(--rgb-gold-victory), 0.06) 45%, transparent 70%)',
};
const VICTORY_WHITE_BLOOM: React.CSSProperties = {
  background:
    'radial-gradient(circle, rgba(var(--rgb-white), 0.22) 0%, rgba(var(--rgb-white), 0.06) 40%, transparent 65%)',
};

// DESIGN_REFERENCE.md §3.4 — multi-layered display text-shadow per outcome.
const VICTORY_TITLE_SHADOW = 'var(--shadow-title-victory)';
const DEFEAT_TITLE_SHADOW = 'var(--shadow-title-defeat)';
const NEUTRAL_TITLE_SHADOW = 'var(--shadow-title-neutral)';

// DESIGN_REFERENCE.md §3.9 — tapered wing lines flanking the title.
const WING_LEFT_VICTORY: React.CSSProperties = {
  background: 'linear-gradient(to right, transparent, rgba(var(--rgb-gold-victory), 0.5))',
};
const WING_RIGHT_VICTORY: React.CSSProperties = {
  background: 'linear-gradient(to left, transparent, rgba(var(--rgb-gold-victory), 0.5))',
};
const WING_LEFT_DEFEAT: React.CSSProperties = {
  background: 'linear-gradient(to right, transparent, rgba(var(--rgb-crimson), 0.55))',
};
const WING_RIGHT_DEFEAT: React.CSSProperties = {
  background: 'linear-gradient(to left, transparent, rgba(var(--rgb-crimson), 0.55))',
};
const WING_LEFT_NEUTRAL: React.CSSProperties = {
  background: 'linear-gradient(to right, transparent, rgba(var(--rgb-moon-silver), 0.45))',
};
const WING_RIGHT_NEUTRAL: React.CSSProperties = {
  background: 'linear-gradient(to left, transparent, rgba(var(--rgb-moon-silver), 0.45))',
};

// DESIGN_REFERENCE.md §5.19 — top accent line on the glass result panel.
const ACCENT_LINE_VICTORY: React.CSSProperties = {
  background:
    'linear-gradient(to right, transparent, rgba(var(--rgb-gold-victory), 0.75), transparent)',
};
const ACCENT_LINE_DEFEAT: React.CSSProperties = {
  background:
    'linear-gradient(to right, transparent, rgba(var(--rgb-crimson), 0.75), transparent)',
};
const ACCENT_LINE_NEUTRAL: React.CSSProperties = {
  background:
    'linear-gradient(to right, transparent, rgba(var(--rgb-gold-accent), 0.5), transparent)',
};

// Screen-local atmosphere map. OUTCOME_TONE (outcome-tone.ts) is the shared
// source-of-truth for the in-battle overlay's semantic colors; the result
// screen's ceremonial visual language uses the Kombats palette instead, so
// this lookup captures the per-outcome visual variant in one place rather
// than scattering conditionals through the JSX.
type AtmosphereVariant = 'victory' | 'defeat' | 'neutral';

interface AtmosphereTokens {
  titleClass: string;
  titleShadow: string;
  wingLeftStyle: React.CSSProperties;
  wingRightStyle: React.CSSProperties;
  accentLineStyle: React.CSSProperties;
  myRoleLabel: string;
  myRoleClass: string;
  oppRoleLabel: string;
  oppRoleClass: string;
  finalExchangeBorder: string;
  subtitleTone: string;
}

const ATMOSPHERE: Record<AtmosphereVariant, AtmosphereTokens> = {
  victory: {
    titleClass: 'text-victory-gold',
    titleShadow: VICTORY_TITLE_SHADOW,
    wingLeftStyle: WING_LEFT_VICTORY,
    wingRightStyle: WING_RIGHT_VICTORY,
    accentLineStyle: ACCENT_LINE_VICTORY,
    myRoleLabel: 'Victor',
    myRoleClass: 'text-victory-gold',
    oppRoleLabel: 'Defeated',
    oppRoleClass: 'text-text-muted',
    finalExchangeBorder: 'rgba(var(--rgb-gold-victory), 0.30)',
    subtitleTone: 'Triumph in Combat',
  },
  defeat: {
    titleClass: 'text-kombats-crimson',
    titleShadow: DEFEAT_TITLE_SHADOW,
    wingLeftStyle: WING_LEFT_DEFEAT,
    wingRightStyle: WING_RIGHT_DEFEAT,
    accentLineStyle: ACCENT_LINE_DEFEAT,
    myRoleLabel: 'Defeated',
    myRoleClass: 'text-kombats-crimson',
    oppRoleLabel: 'Victor',
    oppRoleClass: 'text-victory-gold',
    finalExchangeBorder: 'rgba(var(--rgb-crimson), 0.40)',
    subtitleTone: 'Your opponent prevailed',
  },
  neutral: {
    titleClass: 'text-kombats-gold',
    titleShadow: NEUTRAL_TITLE_SHADOW,
    wingLeftStyle: WING_LEFT_NEUTRAL,
    wingRightStyle: WING_RIGHT_NEUTRAL,
    accentLineStyle: ACCENT_LINE_NEUTRAL,
    myRoleLabel: 'You',
    myRoleClass: 'text-text-secondary',
    oppRoleLabel: 'Opponent',
    oppRoleClass: 'text-text-secondary',
    finalExchangeBorder: 'rgba(var(--rgb-gold-accent), 0.25)',
    subtitleTone: 'The match has concluded',
  },
};

function outcomeToVariant(outcome: BattleEndOutcome): AtmosphereVariant {
  if (outcome === 'victory') return 'victory';
  if (outcome === 'defeat') return 'defeat';
  return 'neutral';
}

function lastTurnEntry(
  entries: readonly BattleFeedEntry[],
): BattleFeedEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].turnIndex !== END_OF_BATTLE_TURN_INDEX) {
      return entries[i];
    }
  }
  return entries[entries.length - 1] ?? null;
}

export function BattleResultScreen() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();

  const phase = useBattlePhase();
  const { endReason, winnerPlayerId } = useBattleResult();
  const myId = useAuthStore((s) => s.userIdentityId);
  const storeBattleId = useBattleStore((s) => s.battleId);
  const playerAId = useBattleStore((s) => s.playerAId);
  const playerAName = useBattleStore((s) => s.playerAName);
  const playerBName = useBattleStore((s) => s.playerBName);
  const returnFromBattle = usePlayerStore((s) => s.returnFromBattle);

  const feed = useResultBattleFeed(battleId ?? null);
  const reduceMotion = useReducedMotion();

  if (!battleId) {
    return <p className="p-6 text-error">Missing battle ID.</p>;
  }

  if (storeBattleId !== null && storeBattleId !== battleId) {
    return <Navigate to="/lobby" replace />;
  }

  if (phase !== 'Ended') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const { outcome, title, subtitle } = deriveOutcome(endReason, winnerPlayerId, myId);
  const variant = outcomeToVariant(outcome);
  const atm = ATMOSPHERE[variant];

  const isPlayerA = myId !== null && myId === playerAId;
  const myName = (isPlayerA ? playerAName : playerBName) ?? 'You';
  const opponentName = (isPlayerA ? playerBName : playerAName) ?? 'Opponent';

  const exchange = lastTurnEntry(feed.entries);

  const handleReturn = () => {
    // Atomic post-battle handoff. Marks the battle dismissed (so stale
    // `queueStatus.Matched.<battleId>` refetches are suppressed until the
    // backend projection catches up), clears any active queue entry, and
    // flags the next lobby mount to run the DEC-5 XP/level refresh.
    returnFromBattle(battleId);
    navigate('/lobby');
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Scene image */}
      <img
        src={bgScene}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* Dark overlay, tone-specific density */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={variant === 'victory' ? VICTORY_OVERLAY : variant === 'defeat' ? DEFEAT_OVERLAY : VICTORY_OVERLAY}
      />

      {variant === 'victory' && (
        <>
          {/* DESIGN_REFERENCE.md §3.5 — rotating conic-gradient rays. 60s
              linear rotation; skipped entirely when the user has
              prefers-reduced-motion enabled. */}
          {reduceMotion ? (
            <div
              aria-hidden
              className="pointer-events-none fixed top-1/2 left-1/2"
              style={{
                width: '150vmax',
                height: '150vmax',
                marginTop: '-75vmax',
                marginLeft: '-75vmax',
                borderRadius: '50%',
                background: VICTORY_RAYS_BACKGROUND,
                WebkitMaskImage: VICTORY_RAYS_MASK,
                maskImage: VICTORY_RAYS_MASK,
              }}
            />
          ) : (
            <motion.div
              aria-hidden
              className="pointer-events-none fixed top-1/2 left-1/2"
              style={{
                width: '150vmax',
                height: '150vmax',
                marginTop: '-75vmax',
                marginLeft: '-75vmax',
                borderRadius: '50%',
                background: VICTORY_RAYS_BACKGROUND,
                WebkitMaskImage: VICTORY_RAYS_MASK,
                maskImage: VICTORY_RAYS_MASK,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 60, ease: 'linear', repeat: Infinity }}
            />
          )}
          {/* DESIGN_REFERENCE.md §3.6 — two-layer bloom at 25% from top. */}
          <div
            aria-hidden
            className="pointer-events-none fixed left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: 380,
              height: 380,
              borderRadius: '50%',
              ...VICTORY_GOLD_BLOOM,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: 200,
              height: 200,
              borderRadius: '50%',
              ...VICTORY_WHITE_BLOOM,
            }}
          />
        </>
      )}

      {variant === 'defeat' && (
        <>
          {/* DESIGN_REFERENCE.md §3.7 */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0"
            style={DEFEAT_VIGNETTE}
          />
          {/* DESIGN_REFERENCE.md §3.8 */}
          <svg
            aria-hidden
            className="pointer-events-none fixed inset-0"
            style={{ opacity: 0.2 }}
            viewBox="0 0 1920 1080"
            preserveAspectRatio="none"
          >
            <line
              x1="1350" y1="-50" x2="400" y2="1130"
              stroke="var(--color-kombats-crimson)" strokeWidth="40" strokeLinecap="round" opacity="0.7"
            />
            <line
              x1="1350" y1="-50" x2="400" y2="1130"
              stroke="var(--color-kombats-crimson-bright)" strokeWidth="8" strokeLinecap="round" opacity="0.5"
            />
            <line
              x1="1500" y1="-30" x2="550" y2="1110"
              stroke="var(--color-kombats-crimson)" strokeWidth="32" strokeLinecap="round" opacity="0.6"
            />
            <line
              x1="1500" y1="-30" x2="550" y2="1110"
              stroke="var(--color-kombats-crimson-bright)" strokeWidth="6" strokeLinecap="round" opacity="0.4"
            />
            <line
              x1="1650" y1="-70" x2="700" y2="1150"
              stroke="var(--color-kombats-crimson)" strokeWidth="44" strokeLinecap="round" opacity="0.5"
            />
            <line
              x1="1650" y1="-70" x2="700" y2="1150"
              stroke="var(--color-kombats-crimson-bright)" strokeWidth="10" strokeLinecap="round" opacity="0.4"
            />
          </svg>
        </>
      )}

      {/* Content column */}
      <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8">
        {/* Title row — tapered wings + Cinzel title */}
        <div className="flex items-center justify-center gap-5">
          <div
            aria-hidden
            style={{ width: 60, height: 1, ...atm.wingLeftStyle }}
          />
          <h1
            className={clsx(
              'font-display uppercase',
              atm.titleClass,
            )}
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: '0.28em',
              lineHeight: 1,
              textShadow: atm.titleShadow,
            }}
          >
            {title.replace(/!$/, '')}
          </h1>
          <div
            aria-hidden
            style={{ width: 60, height: 1, ...atm.wingRightStyle }}
          />
        </div>

        {/* Subtitle */}
        <p
          className="text-center text-text-muted"
          style={{
            fontSize: 12,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </p>

        {endReason && outcome === 'other' && endReason !== 'Unknown' && (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            Reason: {endReason}
          </p>
        )}

        {/* Glass result panel — DESIGN_REFERENCE.md §5.19 */}
        <div
          className="relative w-full max-w-[520px] overflow-hidden rounded-md border-[0.5px] border-border-subtle bg-glass"
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: 'var(--shadow-panel-lift)',
          }}
        >
          {/* Top accent line */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-0"
            style={{ height: 3, ...atm.accentLineStyle }}
          />

          <div className="flex flex-col gap-5 px-6 py-6">
            {/* Names grid */}
            <div className="grid grid-cols-2 gap-4">
              <NamePanel
                name={myName}
                roleLabel={atm.myRoleLabel}
                roleClass={atm.myRoleClass}
              />
              <NamePanel
                name={opponentName}
                roleLabel={atm.oppRoleLabel}
                roleClass={atm.oppRoleClass}
                align="right"
              />
            </div>

            <div
              aria-hidden
              style={{
                borderTop: '1px solid var(--color-border-divider)',
              }}
            />

            {/* Final Exchange block — DESIGN_REFERENCE.md §5.19. Shows the
                last actual turn narration so the user reads the line that
                ended the fight. useResultBattleFeed keeps both the live
                store feed and the HTTP backfill behind this — when the
                store is empty on a fresh reload the HTTP feed fills in. */}
            {exchange ? (
              <div
                className="rounded-sm bg-glass-subtle px-4 py-2.5"
                style={{
                  borderLeft: `3px solid ${atm.finalExchangeBorder}`,
                }}
              >
                <p
                  className="mb-1 uppercase"
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    color: 'var(--color-accent-text)',
                  }}
                >
                  Final Exchange
                </p>
                <p className="text-[13px] leading-snug text-text-secondary">
                  {exchange.text}
                </p>
              </div>
            ) : feed.isError ? (
              <div className="rounded-sm border-[0.5px] border-warning/40 bg-warning/10 px-4 py-2.5 text-[12px] text-warning">
                Could not load the battle feed.
              </div>
            ) : null}

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleReturn}
                className="inline-flex items-center justify-center rounded-md bg-accent-primary px-6 py-2.5 font-display text-[13px] uppercase tracking-[0.24em] text-text-on-accent transition-colors duration-150 hover:bg-kombats-gold-light"
              >
                Return to Lobby
              </button>
              <button
                type="button"
                onClick={handleReturn}
                className="inline-flex items-center justify-center rounded-md border-[0.5px] border-border-emphasis bg-transparent px-6 py-2.5 font-display text-[13px] uppercase tracking-[0.24em] text-text-primary transition-colors duration-150 hover:bg-white/5"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NamePanelProps {
  name: string;
  roleLabel: string;
  roleClass: string;
  align?: 'left' | 'right';
}

function NamePanel({ name, roleLabel, roleClass, align = 'left' }: NamePanelProps) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-1',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span
        className={clsx('uppercase', roleClass)}
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.28em',
        }}
      >
        {roleLabel}
      </span>
      <span
        className="font-display text-text-primary"
        style={{
          fontSize: 18,
          letterSpacing: '0.08em',
          textShadow: 'var(--shadow-text-on-glass)',
        }}
      >
        {name}
      </span>
    </div>
  );
}