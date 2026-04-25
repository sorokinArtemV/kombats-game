import { useState, type CSSProperties } from 'react';
import { clsx } from 'clsx';
import { motion, useReducedMotion } from 'motion/react';
import { useBattlePhase, useBattleActions, useBattleConnectionState } from '../hooks';
import { ALL_ZONES, VALID_BLOCK_PAIRS, isValidBlockPair } from '../zones';
import silhouetteSrc from '@/ui/assets/silhouette.png';
import mitsudamoeSrc from '@/ui/assets/icons/mitsudamoe.png';
import type { BattleZone } from '@/types/battle';

// ---------------------------------------------------------------------------
// Zone geometry — overlap-feather model.
//
// Bands are container-% values (0% top, 100% bottom of the silhouette stage).
// Inner edges between adjacent bands meet exactly at a shared boundary; the
// feather ramp at each interior edge is centered on that boundary with half
// extending into each neighbour's territory. At the boundary line itself the
// alpha is ≈0.5 on both sides, so two adjacent fills sum to ≈1 and no
// transparent stripe appears between selected zones.
//
//   Head    4 → 20
//   Chest   20 → 36
//   Belly   36 → 49
//   Waist   49 → 73
//   Legs    73 → 91
//
// Head's top edge and Legs' bottom edge stay sharp — the silhouette PNG
// already defines the head contour and boot contour, so layering an extra
// fade there would double-feather the natural shape.
// ---------------------------------------------------------------------------

interface ZoneBand {
  top: number;
  bottom: number;
}

const ZONE_BANDS: Record<BattleZone, ZoneBand> = {
  Head: { top: 4, bottom: 20 },
  Chest: { top: 20, bottom: 36 },
  Belly: { top: 36, bottom: 49 },
  Waist: { top: 49, bottom: 73 },
  Legs: { top: 73, bottom: 91 },
};

const ZONE_FEATHER_FRACTION = 0.15;

function clampPct(v: number): number {
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function zoneFeatherAmount(z: BattleZone): number {
  const { top, bottom } = ZONE_BANDS[z];
  return (bottom - top) * ZONE_FEATHER_FRACTION;
}

// Hard edges replace the standard overlap-feather on a side with a zero-width
// transparent→black transition, optionally extended by half the neighbour's
// feather amount so the hover fill becomes opaque exactly where the
// neighbour selection's opaque region ends.
interface HardEdges {
  top?: boolean;
  bottom?: boolean;
}
interface NeighbourFeathers {
  top?: number;
  bottom?: number;
}

function zoneFeatherGradient(
  z: BattleZone,
  hardEdges: HardEdges = {},
  neighbourFeathers: NeighbourFeathers = {},
): string {
  const { top, bottom } = ZONE_BANDS[z];
  const feather = (bottom - top) * ZONE_FEATHER_FRACTION;
  const half = feather / 2;
  const fadeInStart = clampPct(top - half);
  const fadeInEnd = clampPct(top + half);
  const fadeOutStart = clampPct(bottom - half);
  const fadeOutEnd = clampPct(bottom + half);
  const stops: string[] = [];

  if (z === 'Head') {
    stops.push('black 0%');
  } else if (hardEdges.top) {
    const cut = clampPct(top - (neighbourFeathers.top ?? 0) / 2);
    stops.push('transparent 0%', `transparent ${cut}%`, `black ${cut}%`);
  } else {
    stops.push(
      'transparent 0%',
      `transparent ${fadeInStart}%`,
      `black ${fadeInEnd}%`,
    );
  }

  if (z === 'Legs') {
    stops.push('black 100%');
  } else if (hardEdges.bottom) {
    const cut = clampPct(bottom + (neighbourFeathers.bottom ?? 0) / 2);
    stops.push(`black ${cut}%`, `transparent ${cut}%`, 'transparent 100%');
  } else {
    stops.push(
      `black ${fadeOutStart}%`,
      `transparent ${fadeOutEnd}%`,
      'transparent 100%',
    );
  }

  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

function zoneFeatherMaskStyle(
  z: BattleZone,
  hardEdges: HardEdges = {},
  neighbourFeathers: NeighbourFeathers = {},
): CSSProperties {
  const gradient = zoneFeatherGradient(z, hardEdges, neighbourFeathers);
  return {
    WebkitMaskImage: `url(${silhouetteSrc}), ${gradient}`,
    maskImage: `url(${silhouetteSrc}), ${gradient}`,
    WebkitMaskSize: '100% 100%, 100% 100%',
    maskSize: '100% 100%, 100% 100%',
    WebkitMaskRepeat: 'no-repeat, no-repeat',
    maskRepeat: 'no-repeat, no-repeat',
    WebkitMaskPosition: 'center, center',
    maskPosition: 'center, center',
    WebkitMaskComposite: 'source-in',
    maskComposite: 'intersect',
  };
}

interface GradStop {
  offset: string;
  color: 'white' | 'black';
}
function zoneFeatherSvgStops(z: BattleZone): GradStop[] {
  const { top, bottom } = ZONE_BANDS[z];
  const feather = (bottom - top) * ZONE_FEATHER_FRACTION;
  const half = feather / 2;
  const fadeInStart = clampPct(top - half);
  const fadeInEnd = clampPct(top + half);
  const fadeOutStart = clampPct(bottom - half);
  const fadeOutEnd = clampPct(bottom + half);
  if (z === 'Head') {
    return [
      { offset: '0%', color: 'white' },
      { offset: `${fadeOutStart}%`, color: 'white' },
      { offset: `${fadeOutEnd}%`, color: 'black' },
      { offset: '100%', color: 'black' },
    ];
  }
  if (z === 'Legs') {
    return [
      { offset: '0%', color: 'black' },
      { offset: `${fadeInStart}%`, color: 'black' },
      { offset: `${fadeInEnd}%`, color: 'white' },
      { offset: '100%', color: 'white' },
    ];
  }
  return [
    { offset: '0%', color: 'black' },
    { offset: `${fadeInStart}%`, color: 'black' },
    { offset: `${fadeInEnd}%`, color: 'white' },
    { offset: `${fadeOutStart}%`, color: 'white' },
    { offset: `${fadeOutEnd}%`, color: 'black' },
    { offset: '100%', color: 'black' },
  ];
}

// Adjacent block pairs render as ONE seamless fill. The wraparound 'Legs +
// Head' pair is non-adjacent (band-wise) and falls back to two singles.
type ZonePair = { upper: BattleZone; lower: BattleZone };

const ADJACENT_PAIRS: readonly ZonePair[] = [
  { upper: 'Head', lower: 'Chest' },
  { upper: 'Chest', lower: 'Belly' },
  { upper: 'Belly', lower: 'Waist' },
  { upper: 'Waist', lower: 'Legs' },
] as const;

function adjacentBlockPair(a: BattleZone, b: BattleZone): ZonePair | null {
  const ba = ZONE_BANDS[a];
  const bb = ZONE_BANDS[b];
  if (ba.bottom === bb.top) return { upper: a, lower: b };
  if (bb.bottom === ba.top) return { upper: b, lower: a };
  return null;
}

function zoneAbove(z: BattleZone): BattleZone | null {
  const i = ALL_ZONES.indexOf(z);
  return i > 0 ? ALL_ZONES[i - 1] : null;
}
function zoneBelow(z: BattleZone): BattleZone | null {
  const i = ALL_ZONES.indexOf(z);
  return i >= 0 && i < ALL_ZONES.length - 1 ? ALL_ZONES[i + 1] : null;
}

// Pair mask. Interior boundary is feather-less (continuous black) so the
// two zones render as one seamless fill. Outer edges follow the same
// overlap-feather geometry; hard edges + neighbour feathers apply only to
// the pair's outer edges and use the /2 extension rule.
function pairFeatherGradient(
  { upper, lower }: ZonePair,
  hardEdges: HardEdges = {},
  neighbourFeathers: NeighbourFeathers = {},
): string {
  const ub = ZONE_BANDS[upper];
  const lb = ZONE_BANDS[lower];
  const upperFeather = (ub.bottom - ub.top) * ZONE_FEATHER_FRACTION;
  const lowerFeather = (lb.bottom - lb.top) * ZONE_FEATHER_FRACTION;
  const upperHalf = upperFeather / 2;
  const lowerHalf = lowerFeather / 2;
  const topFadeStart = clampPct(ub.top - upperHalf);
  const topFadeEnd = clampPct(ub.top + upperHalf);
  const bottomFadeStart = clampPct(lb.bottom - lowerHalf);
  const bottomFadeEnd = clampPct(lb.bottom + lowerHalf);
  const stops: string[] = [];

  if (upper === 'Head') {
    stops.push('black 0%');
  } else if (hardEdges.top) {
    const cut = clampPct(ub.top - (neighbourFeathers.top ?? 0) / 2);
    stops.push('transparent 0%', `transparent ${cut}%`, `black ${cut}%`);
  } else {
    stops.push(
      'transparent 0%',
      `transparent ${topFadeStart}%`,
      `black ${topFadeEnd}%`,
    );
  }

  if (lower === 'Legs') {
    stops.push('black 100%');
  } else if (hardEdges.bottom) {
    const cut = clampPct(lb.bottom + (neighbourFeathers.bottom ?? 0) / 2);
    stops.push(`black ${cut}%`, `transparent ${cut}%`, 'transparent 100%');
  } else {
    stops.push(
      `black ${bottomFadeStart}%`,
      `transparent ${bottomFadeEnd}%`,
      'transparent 100%',
    );
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

function pairFeatherMaskStyle(
  pair: ZonePair,
  hardEdges: HardEdges = {},
  neighbourFeathers: NeighbourFeathers = {},
): CSSProperties {
  const gradient = pairFeatherGradient(pair, hardEdges, neighbourFeathers);
  return {
    WebkitMaskImage: `url(${silhouetteSrc}), ${gradient}`,
    maskImage: `url(${silhouetteSrc}), ${gradient}`,
    WebkitMaskSize: '100% 100%, 100% 100%',
    maskSize: '100% 100%, 100% 100%',
    WebkitMaskRepeat: 'no-repeat, no-repeat',
    maskRepeat: 'no-repeat, no-repeat',
    WebkitMaskPosition: 'center, center',
    maskPosition: 'center, center',
    WebkitMaskComposite: 'source-in',
    maskComposite: 'intersect',
  };
}

function pairFeatherSvgStops({ upper, lower }: ZonePair): GradStop[] {
  const ub = ZONE_BANDS[upper];
  const lb = ZONE_BANDS[lower];
  const upperFeather = (ub.bottom - ub.top) * ZONE_FEATHER_FRACTION;
  const lowerFeather = (lb.bottom - lb.top) * ZONE_FEATHER_FRACTION;
  const upperHalf = upperFeather / 2;
  const lowerHalf = lowerFeather / 2;
  const topFadeStart = clampPct(ub.top - upperHalf);
  const topFadeEnd = clampPct(ub.top + upperHalf);
  const bottomFadeStart = clampPct(lb.bottom - lowerHalf);
  const bottomFadeEnd = clampPct(lb.bottom + lowerHalf);
  const stops: GradStop[] = [];
  if (upper === 'Head') {
    stops.push({ offset: '0%', color: 'white' });
  } else {
    stops.push(
      { offset: '0%', color: 'black' },
      { offset: `${topFadeStart}%`, color: 'black' },
      { offset: `${topFadeEnd}%`, color: 'white' },
    );
  }
  if (lower === 'Legs') {
    stops.push({ offset: '100%', color: 'white' });
  } else {
    stops.push(
      { offset: `${bottomFadeStart}%`, color: 'white' },
      { offset: `${bottomFadeEnd}%`, color: 'black' },
      { offset: '100%', color: 'black' },
    );
  }
  return stops;
}

// ---------------------------------------------------------------------------
// Shared visual styles
// ---------------------------------------------------------------------------

const silhouetteOnlyMask: CSSProperties = {
  WebkitMaskImage: `url(${silhouetteSrc})`,
  maskImage: `url(${silhouetteSrc})`,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
};

const silhouetteBaseStyle: CSSProperties = {
  ...silhouetteOnlyMask,
  background: 'var(--color-silhouette)',
  filter:
    'drop-shadow(0 0 2px rgba(var(--rgb-gold-accent), 0.15)) drop-shadow(0 10px 24px rgba(var(--rgb-black), 0.6))',
};

const warmBackdropStyle: CSSProperties = {
  inset: '-8% -14%',
  background:
    'radial-gradient(58% 55% at 50% 55%, rgba(var(--rgb-gold), 0.05) 0%, rgba(var(--rgb-ink-navy), 0) 70%)',
};

const tacticalGridStyle: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, rgba(var(--rgb-gold-accent), 0.12) 1px, transparent 1.5px)',
  backgroundSize: '12px 12px',
  WebkitMaskImage:
    'radial-gradient(ellipse at center, black 50%, transparent 90%)',
  maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
};

function selectedFillBackground(rgbVar: string): string {
  return `radial-gradient(ellipse at center, rgba(var(${rgbVar}), 0.7) 0%, rgba(var(${rgbVar}), 0.3) 60%, rgba(var(${rgbVar}), 0) 100%)`;
}

function hoverFillBackground(rgbVar: string): string {
  return `rgba(var(${rgbVar}), 0.25)`;
}

const ATTACK_RGB = '--rgb-crimson';
const BLOCK_RGB = '--rgb-jade';

// SVG <feFlood> needs a literal colour string — CSS variable resolution does
// not happen inside the filter graph. The values mirror tokens.css attack /
// block channel triples.
const ATTACK_FLOOD = 'rgb(192, 55, 68)';
const BLOCK_FLOOD = 'rgb(90, 138, 122)';

// ---------------------------------------------------------------------------
// Main component — keeps every production data binding intact.
// ---------------------------------------------------------------------------

export function BodyZoneSelector() {
  const phase = useBattlePhase();
  const connectionState = useBattleConnectionState();
  const actions = useBattleActions();
  const reduceMotion = useReducedMotion();

  // Two-click block flow: held locally because the store only accepts
  // fully-formed (adjacent) pairs via `selectBlockPair`.
  const [blockPrimary, setBlockPrimary] = useState<BattleZone | null>(null);

  const turnOpen = phase === 'TurnOpen';
  const connectionBlocked = connectionState !== 'connected';
  const disabled = !turnOpen || connectionBlocked || actions.isSubmitting;
  const canGo = actions.canSubmit && !connectionBlocked;
  const isWaiting = phase === 'Submitted' || phase === 'Resolving';

  const handleAttackClick = (zone: BattleZone) => {
    if (disabled) return;
    actions.selectAttackZone(zone);
  };

  const handleBlockClick = (zone: BattleZone) => {
    if (disabled) return;
    const committed = actions.selectedBlockPair;
    if (committed && committed[0] === zone) {
      setBlockPrimary(zone);
      return;
    }
    if (!blockPrimary) {
      setBlockPrimary(zone);
      return;
    }
    if (blockPrimary === zone) {
      setBlockPrimary(null);
      return;
    }
    if (isValidBlockPair(blockPrimary, zone)) {
      actions.selectBlockPair([blockPrimary, zone]);
      setBlockPrimary(null);
    } else {
      setBlockPrimary(zone);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid grid-cols-2 gap-4 rounded-sm border-[0.5px] border-border-subtle bg-glass-subtle p-4"
        style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      >
        {isWaiting ? (
          <div className="col-span-2 flex items-center justify-center py-6">
            <LockedInSpinner reduceMotion={reduceMotion ?? false} />
          </div>
        ) : (
          <>
            <SilhouetteColumn
              mode="attack"
              headerLabel="Attack"
              headerColor="var(--color-kombats-crimson-light)"
              headerGlow="0 2px 14px rgba(var(--rgb-crimson), 0.35)"
              selected={
                actions.selectedAttackZone ? [actions.selectedAttackZone] : []
              }
              onZoneClick={handleAttackClick}
              selectionLabel={actions.selectedAttackZone ?? null}
              placeholder="Select zone"
              disabled={disabled}
            />
            <SilhouetteColumn
              mode="block"
              headerLabel="Block"
              headerColor="var(--color-kombats-jade-light)"
              headerGlow="0 2px 14px rgba(var(--rgb-jade), 0.35)"
              selected={
                actions.selectedBlockPair
                  ? [actions.selectedBlockPair[0], actions.selectedBlockPair[1]]
                  : blockPrimary
                    ? [blockPrimary]
                    : []
              }
              onZoneClick={handleBlockClick}
              selectionLabel={
                actions.selectedBlockPair
                  ? `${actions.selectedBlockPair[0]} + ${actions.selectedBlockPair[1]}`
                  : blockPrimary
                    ? `${blockPrimary} + ?`
                    : null
              }
              placeholder="Select pair"
              disabled={disabled}
            />
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={actions.submitAction}
          disabled={!canGo && !isWaiting}
          aria-label={isWaiting ? 'Locked in' : 'Lock in attack and block'}
          className={clsx(
            'inline-flex items-center justify-center rounded-md px-10 py-2.5 font-display text-[13px] font-medium uppercase tracking-[0.24em] transition-[background-color,border-color,opacity] duration-150',
            isWaiting
              ? 'cursor-not-allowed border-[0.5px] border-border-emphasis bg-transparent text-accent-text'
              : canGo
                ? 'bg-accent-primary text-text-on-accent hover:bg-kombats-gold-light'
                : 'cursor-not-allowed bg-bg-surface text-text-muted opacity-60',
          )}
        >
          {isWaiting ? 'Locked In ✓' : 'Lock In'}
        </button>

        {connectionBlocked && turnOpen && (
          <p className="text-center text-[11px] uppercase tracking-[0.18em] text-kombats-crimson-light">
            Waiting for connection before submitting…
          </p>
        )}
      </div>

      {/* Accessible secondary pair list for keyboard users. */}
      {!isWaiting && (
        <fieldset className="sr-only" aria-label="Select block pair">
          <legend>Valid block pairs</legend>
          {VALID_BLOCK_PAIRS.map((pair) => (
            <label key={`${pair[0]}-${pair[1]}`}>
              <input
                type="radio"
                name="block-pair"
                disabled={disabled}
                checked={
                  actions.selectedBlockPair?.[0] === pair[0] &&
                  actions.selectedBlockPair?.[1] === pair[1]
                }
                onChange={() => {
                  if (disabled) return;
                  actions.selectBlockPair(pair);
                  setBlockPrimary(null);
                }}
              />
              {`${pair[0]} + ${pair[1]}`}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Silhouette column — one side of the diptych. Owns its own hover state so
// the two columns never influence each other.
// ---------------------------------------------------------------------------

interface SilhouetteColumnProps {
  mode: 'attack' | 'block';
  headerLabel: string;
  headerColor: string;
  headerGlow: string;
  selected: BattleZone[];
  onZoneClick: (zone: BattleZone) => void;
  selectionLabel: string | null;
  placeholder: string;
  disabled: boolean;
}

function SilhouetteColumn({
  mode,
  headerLabel,
  headerColor,
  headerGlow,
  selected,
  onZoneClick,
  selectionLabel,
  placeholder,
  disabled,
}: SilhouetteColumnProps) {
  const [hover, setHover] = useState<BattleZone | null>(null);
  const rgb = mode === 'attack' ? ATTACK_RGB : BLOCK_RGB;
  const flood = mode === 'attack' ? ATTACK_FLOOD : BLOCK_FLOOD;

  // Selection: a committed pair (two adjacent zones) renders as one
  // seamless fill via pairFeatherMaskStyle. A single zone (attack pick or
  // block-primary) renders as one zoneFeatherMaskStyle item. Wraparound
  // 'Legs + Head' is non-adjacent and falls back to two independent fills.
  type FilledItem =
    | { kind: 'single'; zone: BattleZone }
    | { kind: 'pair'; pair: ZonePair };
  const filledItems: FilledItem[] = (() => {
    if (selected.length === 0) return [];
    if (selected.length === 1) {
      return [{ kind: 'single', zone: selected[0] }];
    }
    const pair = adjacentBlockPair(selected[0], selected[1]);
    if (pair) return [{ kind: 'pair', pair }];
    return [
      { kind: 'single', zone: selected[0] },
      { kind: 'single', zone: selected[1] },
    ];
  })();

  const visibleFilledZones: BattleZone[] = filledItems.flatMap((item) =>
    item.kind === 'single' ? [item.zone] : [item.pair.upper, item.pair.lower],
  );

  // Hover preview lives on the single hovered zone (single-zone hover for
  // both attack and block columns, since the production block click flow
  // is two-click rather than auto-anchor).
  const showHover = hover !== null && !visibleFilledZones.includes(hover);

  // Adjacency pass: if the hover target sits directly above/below a
  // currently-selected zone, give that edge a hard cut extended by the
  // selection's feather/2 so the two fills meet flush instead of leaving a
  // partially-opacified seam between them.
  const hoverHardEdges: HardEdges = {};
  const hoverNeighbourFeathers: NeighbourFeathers = {};
  if (showHover && hover) {
    const above = zoneAbove(hover);
    const below = zoneBelow(hover);
    if (above && visibleFilledZones.includes(above)) {
      hoverHardEdges.top = true;
      hoverNeighbourFeathers.top = zoneFeatherAmount(above);
    }
    if (below && visibleFilledZones.includes(below)) {
      hoverHardEdges.bottom = true;
      hoverNeighbourFeathers.bottom = zoneFeatherAmount(below);
    }
  }

  const cornerColor =
    mode === 'attack'
      ? 'rgba(var(--rgb-crimson), 0.35)'
      : 'rgba(var(--rgb-jade), 0.35)';

  // Namespacing SVG IDs by mode prevents collisions between the two
  // columns mounted side-by-side (filter / mask / gradient lookups
  // resolve via document-wide ID).
  const filterId = `kombats-zone-outline-${mode}`;
  const hoverFilterId = `kombats-zone-hover-${mode}`;
  const zoneMaskId = (z: BattleZone) => `kombats-zone-mask-${mode}-${z}`;
  const zoneGradId = (z: BattleZone) => `kombats-zone-grad-${mode}-${z}`;
  const pairMaskId = (id: string) => `kombats-pair-mask-${mode}-${id}`;
  const pairGradId = (id: string) => `kombats-pair-grad-${mode}-${id}`;

  const showOutline = filledItems.length > 0 || showHover;

  return (
    <div className="relative flex flex-col items-center gap-3">
      <CornerMarks color={cornerColor} side={mode === 'attack' ? 'left' : 'right'} />

      <h3
        className="font-display uppercase"
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '0.24em',
          color: headerColor,
          textShadow: headerGlow,
        }}
      >
        {headerLabel}
      </h3>

      <div
        className="relative mx-auto aspect-[2/3] w-full max-w-[210px] select-none"
        onMouseLeave={() => setHover(null)}
      >
        {/* Soft warm radial backdrop. */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={warmBackdropStyle}
        />

        {/* Tactical-grid dot pattern. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={tacticalGridStyle}
        />

        {/* Dark base silhouette body. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={silhouetteBaseStyle}
        />

        {/* Selection radial fills — silhouette × overlap-feather mask. */}
        {filledItems.map((item) => {
          if (item.kind === 'single') {
            return (
              <div
                key={`fill-${item.zone}`}
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  ...zoneFeatherMaskStyle(item.zone),
                  background: selectedFillBackground(rgb),
                  animation: 'kombats-zone-pulse 2.5s ease-in-out infinite',
                }}
              />
            );
          }
          return (
            <div
              key={`fill-pair-${item.pair.upper}-${item.pair.lower}`}
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                ...pairFeatherMaskStyle(item.pair),
                background: selectedFillBackground(rgb),
                animation: 'kombats-zone-pulse 2.5s ease-in-out infinite',
              }}
            />
          );
        })}

        {/* Hover preview fill — flat alpha, 150ms fade-in. Adjacency-aware
            hard edges so it sits flush against any selected neighbour. */}
        {showHover && hover && (
          <div
            key={`hover-${hover}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...zoneFeatherMaskStyle(hover, hoverHardEdges, hoverNeighbourFeathers),
              background: hoverFillBackground(rgb),
              animation: 'kombats-zone-outline-in 150ms ease-out both',
            }}
          />
        )}

        {/* SVG outline + glow layer. The same silhouette PNG is rendered
            inside an <image> with a feMorphology-derived outline filter and
            a vertical linearGradient mask so the outline feathers at the
            band edges instead of clipping on a rect line. */}
        {showOutline && (
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ overflow: 'visible' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="1"
                  result="dilated"
                />
                <feComposite
                  in="dilated"
                  in2="SourceAlpha"
                  operator="out"
                  result="outline"
                />
                <feGaussianBlur
                  in="outline"
                  stdDeviation="0.5"
                  result="outlineBlurred"
                />
                <feFlood floodColor={flood} result="flood" />
                <feComposite
                  in="flood"
                  in2="outlineBlurred"
                  operator="in"
                  result="coloredOutline"
                />
                <feGaussianBlur
                  in="coloredOutline"
                  stdDeviation="4"
                  result="glow"
                />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="coloredOutline" />
                </feMerge>
              </filter>
              <filter
                id={hoverFilterId}
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="1"
                  result="dilated"
                />
                <feComposite
                  in="dilated"
                  in2="SourceAlpha"
                  operator="out"
                  result="outline"
                />
                <feGaussianBlur
                  in="outline"
                  stdDeviation="0.5"
                  result="outlineBlurred"
                />
                <feFlood
                  floodColor={flood}
                  floodOpacity="0.5"
                  result="flood"
                />
                <feComposite
                  in="flood"
                  in2="outlineBlurred"
                  operator="in"
                  result="coloredOutline"
                />
              </filter>
              {ALL_ZONES.map((z) => {
                const stops = zoneFeatherSvgStops(z);
                return (
                  <g key={`mask-${z}`}>
                    <linearGradient
                      id={zoneGradId(z)}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="100"
                      gradientUnits="userSpaceOnUse"
                      spreadMethod="pad"
                    >
                      {stops.map((s, i) => (
                        <stop
                          key={`${z}-stop-${i}`}
                          offset={s.offset}
                          stopColor={s.color}
                        />
                      ))}
                    </linearGradient>
                    <mask
                      id={zoneMaskId(z)}
                      maskUnits="userSpaceOnUse"
                      x="-20"
                      y="-20"
                      width="140"
                      height="140"
                    >
                      <rect
                        x="-20"
                        y="-20"
                        width="140"
                        height="140"
                        fill={`url(#${zoneGradId(z)})`}
                      />
                    </mask>
                  </g>
                );
              })}
              {ADJACENT_PAIRS.map((p) => {
                const stops = pairFeatherSvgStops(p);
                const id = `${p.upper}-${p.lower}`;
                return (
                  <g key={`mask-pair-${id}`}>
                    <linearGradient
                      id={pairGradId(id)}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="100"
                      gradientUnits="userSpaceOnUse"
                      spreadMethod="pad"
                    >
                      {stops.map((s, i) => (
                        <stop
                          key={`${id}-stop-${i}`}
                          offset={s.offset}
                          stopColor={s.color}
                        />
                      ))}
                    </linearGradient>
                    <mask
                      id={pairMaskId(id)}
                      maskUnits="userSpaceOnUse"
                      x="-20"
                      y="-20"
                      width="140"
                      height="140"
                    >
                      <rect
                        x="-20"
                        y="-20"
                        width="140"
                        height="140"
                        fill={`url(#${pairGradId(id)})`}
                      />
                    </mask>
                  </g>
                );
              })}
            </defs>

            {filledItems.map((item) => {
              const maskHref =
                item.kind === 'single'
                  ? zoneMaskId(item.zone)
                  : pairMaskId(`${item.pair.upper}-${item.pair.lower}`);
              const key =
                item.kind === 'single'
                  ? `outline-${item.zone}`
                  : `outline-pair-${item.pair.upper}-${item.pair.lower}`;
              return (
                <image
                  key={key}
                  href={silhouetteSrc}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  preserveAspectRatio="none"
                  mask={`url(#${maskHref})`}
                  filter={`url(#${filterId})`}
                  style={{
                    animation: 'kombats-zone-pulse 2.5s ease-in-out infinite',
                  }}
                />
              );
            })}

            {showHover && hover && (
              <image
                key={`hover-outline-${hover}`}
                href={silhouetteSrc}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="none"
                mask={`url(#${zoneMaskId(hover)})`}
                filter={`url(#${hoverFilterId})`}
                style={{ animation: 'kombats-zone-outline-in 150ms ease-out' }}
              />
            )}
          </svg>
        )}

        {/* Click targets — one transparent button per zone band. */}
        <div className="absolute inset-0">
          {ALL_ZONES.map((zone) => {
            const band = ZONE_BANDS[zone];
            const top = `${band.top}%`;
            const height = `${band.bottom - band.top}%`;
            const isSelected = visibleFilledZones.includes(zone);
            return (
              <button
                key={zone}
                type="button"
                disabled={disabled}
                onClick={() => onZoneClick(zone)}
                onMouseEnter={() => setHover(zone)}
                onFocus={() => setHover(zone)}
                onBlur={() => setHover((h) => (h === zone ? null : h))}
                aria-label={`${mode === 'attack' ? 'Attack' : 'Block'} ${zone}`}
                aria-pressed={isSelected}
                className="absolute left-0 right-0 cursor-pointer bg-transparent outline-none transition-[background-color] duration-150 focus-visible:bg-white/[0.03] disabled:cursor-not-allowed"
                style={{ top, height }}
              />
            );
          })}
        </div>
      </div>

      {/* Selection value or placeholder caption below the silhouette. */}
      {selectionLabel ? (
        <div
          className="font-display uppercase"
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color:
              mode === 'attack'
                ? 'var(--color-kombats-crimson-light)'
                : 'var(--color-kombats-jade-light)',
          }}
        >
          {selectionLabel}
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            fontStyle: 'italic',
            fontWeight: 400,
            letterSpacing: '0.04em',
            color: 'var(--color-text-muted)',
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}

// DESIGN_REFERENCE.md §3.15 — corner ornament marks.
function CornerMarks({ color, side }: { color: string; side: 'left' | 'right' }) {
  const armPx = 14;
  const thickness = 1.5;
  if (side === 'left') {
    return (
      <>
        <span
          aria-hidden
          className="absolute -z-0"
          style={{
            width: armPx,
            height: armPx,
            top: 0,
            left: 0,
            borderTop: `${thickness}px solid ${color}`,
            borderLeft: `${thickness}px solid ${color}`,
          }}
        />
        <span
          aria-hidden
          className="absolute -z-0"
          style={{
            width: armPx,
            height: armPx,
            bottom: 0,
            left: 0,
            borderBottom: `${thickness}px solid ${color}`,
            borderLeft: `${thickness}px solid ${color}`,
          }}
        />
      </>
    );
  }
  return (
    <>
      <span
        aria-hidden
        className="absolute -z-0"
        style={{
          width: armPx,
          height: armPx,
          top: 0,
          right: 0,
          borderTop: `${thickness}px solid ${color}`,
          borderRight: `${thickness}px solid ${color}`,
        }}
      />
      <span
        aria-hidden
        className="absolute -z-0"
        style={{
          width: armPx,
          height: armPx,
          bottom: 0,
          right: 0,
          borderBottom: `${thickness}px solid ${color}`,
          borderRight: `${thickness}px solid ${color}`,
        }}
      />
    </>
  );
}

// DESIGN_REFERENCE.md §3.12 — Mitsudomoe spinner. Sized to match the
// design_V2 reference (320 glow / 220 ring / 140 icon) so the panel reads
// the same as the ceremonial post-lock-in state.
function LockedInSpinner({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div
      className="relative flex h-[320px] w-[320px] items-center justify-center"
      aria-hidden
    >
      <div
        className="pointer-events-none absolute h-[320px] w-[320px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(var(--rgb-gold-accent), 0.18) 0%, rgba(var(--rgb-gold-accent), 0.08) 35%, rgba(var(--rgb-gold-accent), 0.03) 60%, transparent 80%)',
        }}
      />
      <motion.div
        className="pointer-events-none absolute h-[220px] w-[220px] rounded-full"
        style={{ border: '1px solid rgba(var(--rgb-gold-accent), 0.15)' }}
        animate={reduceMotion ? undefined : { rotate: -360 }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 12, repeat: Infinity, ease: 'linear' }
        }
      />
      <motion.img
        src={mitsudamoeSrc}
        alt=""
        className="pointer-events-none h-[140px] w-[140px] opacity-50 mix-blend-screen"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 8, repeat: Infinity, ease: 'linear' }
        }
      />
    </div>
  );
}
