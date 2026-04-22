import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Sword, Shield } from 'lucide-react';
import silhouetteSrc from '../../assets/fighters/silhouette.png';
import { Divider, Label } from '../../design-system/primitives';
import { accent, semantic, space, text, typography } from '../../design-system/tokens';

// Silhouette stack (inside the width × width*1.5 wrapper, bottom → top):
//   1. Soft backdrop             — faint warm radial glow behind the body.
//   2. Base silhouette           — dark fill, warm edge glow.
//   3. Selection FILL overlays   — silhouette-masked AND feather-masked,
//                                   radial gradient, pulse. Attack mode
//                                   renders one per-zone item; block mode
//                                   renders one *paired* item spanning
//                                   both zones with feather only on the
//                                   outer edges (so adjacent zones don't
//                                   produce a transparent seam). The
//                                   non-adjacent 'Legs & Head' pair falls
//                                   back to two independent singles.
//   4. Per-zone HOVER fill       — always mounted, opacity 0 except on
//                                   the hovered-and-not-selected zone;
//                                   flat fill, same feather mask, 150ms
//                                   opacity transition for fade in/out.
//   5. SVG outline+glow layer    — feMorphology-derived outline + outer
//                                   glow on selected zones, hairline-only
//                                   on hover preview. Masked by a vertical
//                                   linearGradient so the outline feathers
//                                   at the band edges instead of
//                                   terminating on a rect clip line.
//   6. Hit areas                 — full-width rectangles per zone y-band.

const SPLIT_THRESHOLD_PX = 520;

// ---------- Domain ----------

export type BodyZone = 'Head' | 'Chest' | 'Stomach' | 'Waist' | 'Legs';

export const BODY_ZONES: readonly BodyZone[] = [
  'Head',
  'Chest',
  'Stomach',
  'Waist',
  'Legs',
];

export type BlockPair =
  | 'Head & Chest'
  | 'Chest & Stomach'
  | 'Stomach & Waist'
  | 'Waist & Legs'
  | 'Legs & Head';

export const BLOCK_PAIRS: readonly BlockPair[] = [
  'Head & Chest',
  'Chest & Stomach',
  'Stomach & Waist',
  'Waist & Legs',
  'Legs & Head',
];

const PAIR_ZONES: Record<BlockPair, [BodyZone, BodyZone]> = {
  'Head & Chest': ['Head', 'Chest'],
  'Chest & Stomach': ['Chest', 'Stomach'],
  'Stomach & Waist': ['Stomach', 'Waist'],
  'Waist & Legs': ['Waist', 'Legs'],
  'Legs & Head': ['Legs', 'Head'],
};

// Clicking a zone in block mode anchors the pair at that zone
// (downward neighbor). Legs wraps back to Head to match the existing
// game contract.
const ZONE_TO_BLOCK_PAIR: Record<BodyZone, BlockPair> = {
  Head: 'Head & Chest',
  Chest: 'Chest & Stomach',
  Stomach: 'Stomach & Waist',
  Waist: 'Waist & Legs',
  Legs: 'Legs & Head',
};

export function blockPairZones(pair: BlockPair): [BodyZone, BodyZone] {
  return PAIR_ZONES[pair];
}

// ---------- Zone geometry (silhouette-layered architecture) ----------

interface ZoneBand {
  top: number;
  bottom: number;
}

const ZONE_BANDS: Record<BodyZone, ZoneBand> = {
  Head: { top: 4, bottom: 20 },
  Chest: { top: 20, bottom: 40 },
  Stomach: { top: 40, bottom: 49 },
  Waist: { top: 49, bottom: 73 },
  Legs: { top: 73, bottom: 91 },
};

// Filter colors mirror the semantic tone RGB channels — kept as literal
// strings inside SVG filter graph because feFlood needs a plain color
// token, not a CSS variable. Values match tokens.semantic.attack.base
// and tokens.semantic.block.base.
const ATTACK_FLOOD = semantic.attack.base;
const BLOCK_FLOOD = semantic.block.base;
const ATTACK_FILL_RGB = '192, 55, 68';
const BLOCK_FILL_RGB = '90, 138, 122';

const silhouetteMaskStyle: CSSProperties = {
  WebkitMaskImage: `url(${silhouetteSrc})`,
  maskImage: `url(${silhouetteSrc})`,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
};

function zoneFillBackground(rgb: string): string {
  return (
    `radial-gradient(ellipse at center, rgba(${rgb}, 0.7) 0%, ` +
    `rgba(${rgb}, 0.3) 60%, rgba(${rgb}, 0) 100%)`
  );
}

// Feather fraction of each band's own height. 15% matches the per-zone
// gradient spec (black-at-15%, black-at-85%). Head and Legs override the
// outer edge to sharp so the silhouette's natural head/boot contour isn't
// double-faded.
const ZONE_FEATHER_FRACTION = 0.15;

// Vertical mask gradient for a zone. Stops are in container-% space (0% =
// top of silhouette container, 100% = bottom) so a single full-container
// linear-gradient can be composited with the silhouette PNG mask via
// mask-composite: intersect.
function zoneFeatherGradient(z: BodyZone): string {
  const { top, bottom } = ZONE_BANDS[z];
  const feather = (bottom - top) * ZONE_FEATHER_FRACTION;
  if (z === 'Head') {
    // Top sharp at silhouette edge (no fade off the top of the head).
    return (
      `linear-gradient(to bottom, black 0%, black ${bottom - feather}%, ` +
      `transparent ${bottom}%, transparent 100%)`
    );
  }
  if (z === 'Legs') {
    // Bottom sharp at silhouette edge (no fade off the boots).
    return (
      `linear-gradient(to bottom, transparent 0%, transparent ${top}%, ` +
      `black ${top + feather}%, black 100%)`
    );
  }
  return (
    `linear-gradient(to bottom, transparent 0%, transparent ${top}%, ` +
    `black ${top + feather}%, black ${bottom - feather}%, ` +
    `transparent ${bottom}%, transparent 100%)`
  );
}

// Two-mask style for zone overlays: silhouette PNG × feather gradient,
// composited with intersect so the fill follows the body shape AND fades
// at the band's top/bottom.
function zoneFeatherMaskStyle(z: BodyZone): CSSProperties {
  const gradient = zoneFeatherGradient(z);
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

// SVG <mask> stops for the outline layer. Luminance-based: white = visible,
// black = hidden. Coordinates match the 0..100 viewBox.
interface GradStop {
  offset: string;
  color: 'white' | 'black';
}
function zoneFeatherSvgStops(z: BodyZone): GradStop[] {
  const { top, bottom } = ZONE_BANDS[z];
  const feather = (bottom - top) * ZONE_FEATHER_FRACTION;
  if (z === 'Head') {
    return [
      { offset: '0%', color: 'white' },
      { offset: `${bottom - feather}%`, color: 'white' },
      { offset: `${bottom}%`, color: 'black' },
      { offset: '100%', color: 'black' },
    ];
  }
  if (z === 'Legs') {
    return [
      { offset: '0%', color: 'black' },
      { offset: `${top}%`, color: 'black' },
      { offset: `${top + feather}%`, color: 'white' },
      { offset: '100%', color: 'white' },
    ];
  }
  return [
    { offset: '0%', color: 'black' },
    { offset: `${top}%`, color: 'black' },
    { offset: `${top + feather}%`, color: 'white' },
    { offset: `${bottom - feather}%`, color: 'white' },
    { offset: `${bottom}%`, color: 'black' },
    { offset: '100%', color: 'black' },
  ];
}

// Block pairs always cover two zones. Four of the five pairs share a
// boundary (upper.bottom === lower.top) — those must render as one
// continuous fill with feather only on the OUTER edges, otherwise each
// zone's inward feather would combine into a visible transparent seam
// between them. 'Legs & Head' is the one non-adjacent (wraparound) pair
// and falls back to independent per-zone rendering.
type ZonePair = { upper: BodyZone; lower: BodyZone };

const ADJACENT_PAIRS: readonly ZonePair[] = [
  { upper: 'Head', lower: 'Chest' },
  { upper: 'Chest', lower: 'Stomach' },
  { upper: 'Stomach', lower: 'Waist' },
  { upper: 'Waist', lower: 'Legs' },
] as const;

function adjacentBlockPair(pair: BlockPair): ZonePair | null {
  const [a, b] = blockPairZones(pair);
  const ba = ZONE_BANDS[a];
  const bb = ZONE_BANDS[b];
  if (ba.bottom === bb.top) return { upper: a, lower: b };
  if (bb.bottom === ba.top) return { upper: b, lower: a };
  return null;
}

function pairFeatherGradient({ upper, lower }: ZonePair): string {
  const ub = ZONE_BANDS[upper];
  const lb = ZONE_BANDS[lower];
  const upperFeather = (ub.bottom - ub.top) * ZONE_FEATHER_FRACTION;
  const lowerFeather = (lb.bottom - lb.top) * ZONE_FEATHER_FRACTION;
  const stops: string[] = [];
  if (upper === 'Head') {
    stops.push('black 0%');
  } else {
    stops.push(
      'transparent 0%',
      `transparent ${ub.top}%`,
      `black ${ub.top + upperFeather}%`,
    );
  }
  if (lower === 'Legs') {
    stops.push('black 100%');
  } else {
    stops.push(
      `black ${lb.bottom - lowerFeather}%`,
      `transparent ${lb.bottom}%`,
      'transparent 100%',
    );
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

function pairFeatherMaskStyle(pair: ZonePair): CSSProperties {
  const gradient = pairFeatherGradient(pair);
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
  const stops: GradStop[] = [];
  if (upper === 'Head') {
    stops.push({ offset: '0%', color: 'white' });
  } else {
    stops.push(
      { offset: '0%', color: 'black' },
      { offset: `${ub.top}%`, color: 'black' },
      { offset: `${ub.top + upperFeather}%`, color: 'white' },
    );
  }
  if (lower === 'Legs') {
    stops.push({ offset: '100%', color: 'white' });
  } else {
    stops.push(
      { offset: `${lb.bottom - lowerFeather}%`, color: 'white' },
      { offset: `${lb.bottom}%`, color: 'black' },
      { offset: '100%', color: 'black' },
    );
  }
  return stops;
}

type FilledItem =
  | { kind: 'single'; zone: BodyZone }
  | { kind: 'pair'; pair: ZonePair };

type Mode = 'attack' | 'block';

// Flat hover fill color — dimmer than the selected radial gradient so the
// two states don't read the same. Alpha 0.25 per spec.
function zoneHoverFillColor(m: Mode): string {
  return m === 'attack'
    ? `rgba(${ATTACK_FILL_RGB}, 0.25)`
    : `rgba(${BLOCK_FILL_RGB}, 0.25)`;
}

// Informational value rendered below each Label tone. Mirrors QueueCard's
// footerValueStyle but uses text.primary because this is selection state,
// not an accent value.
const VALUE_STYLE: CSSProperties = {
  display: 'block',
  marginTop: space.xs,
  fontSize: 16,
  fontWeight: 500,
  color: text.primary,
  letterSpacing: '0.02em',
};

// ---------- Component ----------

interface BodyZoneSelectorProps {
  attack: BodyZone | null;
  block: BlockPair | null;
  onAttackChange: (zone: BodyZone) => void;
  onBlockChange: (pair: BlockPair) => void;
  className?: string;
  /** Visual size of the silhouette body (width in px). Height is 1.5x. */
  width?: number;
  /**
   * Optional node rendered below the summaries — typically the LOCK IN
   * button. Centered horizontally; no width stretching.
   */
  action?: React.ReactNode;
  /**
   * 'auto' (default) picks split ≥520px, stacked below. 'split' and
   * 'stacked' force the respective layout regardless of container size.
   */
  layout?: 'auto' | 'split' | 'stacked';
}

export function BodyZoneSelector({
  attack,
  block,
  onAttackChange,
  onBlockChange,
  className,
  width = 200,
  action,
  layout = 'auto',
}: BodyZoneSelectorProps) {
  const [mode, setMode] = useState<Mode>('attack');
  const [hover, setHover] = useState<BodyZone | null>(null);
  const [isSplit, setIsSplit] = useState(layout === 'split');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (layout === 'split') {
      setIsSplit(true);
      return;
    }
    if (layout === 'stacked') {
      setIsSplit(false);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const check = () => setIsSplit(el.clientWidth >= SPLIT_THRESHOLD_PX);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  const height = Math.round(width * 1.5);

  const handleClick = (z: BodyZone) => {
    if (mode === 'attack') onAttackChange(z);
    else onBlockChange(ZONE_TO_BLOCK_PAIR[z]);
  };

  // Attack mode selects one zone → one single item. Block mode selects a
  // pair; adjacent pairs render as ONE pair item so the shared boundary
  // has no feather-induced transparent seam. The wraparound 'Legs & Head'
  // pair is non-adjacent and falls back to two singles.
  const filledItems: FilledItem[] = (() => {
    if (mode === 'attack') {
      return attack ? [{ kind: 'single', zone: attack }] : [];
    }
    if (!block) return [];
    const pair = adjacentBlockPair(block);
    if (pair) return [{ kind: 'pair', pair }];
    const [z1, z2] = blockPairZones(block);
    return [
      { kind: 'single', zone: z1 },
      { kind: 'single', zone: z2 },
    ];
  })();

  // Flat list of selected zones — used to gate hover-fill (don't show
  // hover preview over an already-selected zone).
  const visibleFilledZones: BodyZone[] = filledItems.flatMap((item) =>
    item.kind === 'single' ? [item.zone] : [item.pair.upper, item.pair.lower],
  );

  const modeFillRgb = mode === 'attack' ? ATTACK_FILL_RGB : BLOCK_FILL_RGB;

  // Hover preview targets. Attack mode hovers a single zone. Block mode
  // hovers the WHOLE PAIR the zone anchors — adjacent pairs render as
  // one paired fill (no internal seam); the wraparound Legs & Head pair
  // falls back to two singles. Selection takes priority over hover at
  // the pair level: if the hovered pair is the currently selected pair,
  // nothing previews.
  const { hoverPair, hoverZones } = ((): {
    hoverPair: ZonePair | null;
    hoverZones: BodyZone[];
  } => {
    if (hover === null) return { hoverPair: null, hoverZones: [] };
    if (mode === 'attack') {
      if (attack === hover) return { hoverPair: null, hoverZones: [] };
      return { hoverPair: null, hoverZones: [hover] };
    }
    const hoverPairKey = ZONE_TO_BLOCK_PAIR[hover];
    if (block === hoverPairKey) return { hoverPair: null, hoverZones: [] };
    const adj = adjacentBlockPair(hoverPairKey);
    if (adj) return { hoverPair: adj, hoverZones: [] };
    const [z1, z2] = blockPairZones(hoverPairKey);
    return { hoverPair: null, hoverZones: [z1, z2] };
  })();

  const showHoverOutline =
    hover !== null && !visibleFilledZones.includes(hover);

  // Silhouette backdrop layers (bottom → top), transplanted from commit
  // c6837dd so the figure reads as standing inside a tactical HUD rather
  // than floating on bare glass:
  //   1. Soft backdrop   — warm gold radial glow, extends past the
  //                        silhouette bounds (inset -8% -14%).
  //   2. Tactical grid   — warm gold dot pattern tiled at 12×12, masked
  //                        with a radial vignette so it fades at the
  //                        container edges.
  //   3. Base silhouette — dark fill + warm edge glow via drop-shadow.
  const silhouetteBase = (
    <>
      {/* Soft backdrop */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          inset: '-8% -14%',
          background:
            'radial-gradient(58% 55% at 50% 55%, rgba(201,169,97,0.05) 0%, rgba(15,20,25,0) 70%)',
        }}
      />
      {/* Tactical grid — gold dot pattern with radial vignette mask. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(201,162,90,0.12) 1px, transparent 1.5px)',
          backgroundSize: '12px 12px',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 50%, transparent 90%)',
          maskImage:
            'radial-gradient(ellipse at center, black 50%, transparent 90%)',
        }}
      />
      {/* Base silhouette — dark body fill with warm edge glow. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          ...silhouetteMaskStyle,
          background: 'rgb(10, 14, 22)',
          filter:
            'drop-shadow(0 0 2px rgba(201, 162, 90, 0.15)) drop-shadow(0 10px 24px rgba(0,0,0,0.6))',
        }}
      />
    </>
  );

  const silhouetteOverlays = (
    <>
      {filledItems.map((item) => {
        if (item.kind === 'single') {
          return (
            <div
              key={`fill-${item.zone}`}
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                ...zoneFeatherMaskStyle(item.zone),
                background: zoneFillBackground(modeFillRgb),
                animation:
                  'kombats-zone-pulse 2.5s ease-in-out infinite',
              }}
            />
          );
        }
        const { upper, lower } = item.pair;
        return (
          <div
            key={`fill-pair-${upper}-${lower}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...pairFeatherMaskStyle(item.pair),
              background: zoneFillBackground(modeFillRgb),
              animation:
                'kombats-zone-pulse 2.5s ease-in-out infinite',
            }}
          />
        );
      })}

      {/* Hover fill — always-mounted divs for every zone AND every
          adjacent pair. At most one subset has opacity=1 based on
          `hoverZones` / `hoverPair`; others are at opacity 0. Opacity
          transitions provide symmetric 150ms fade in/out even when
          switching between hovered zones. Per-zone divs cover attack
          mode and the block-mode wraparound (Legs & Head); per-pair
          divs cover the four adjacent block pairs so the hover preview
          spans both zones with no transparent seam at the shared
          boundary. */}
      {BODY_ZONES.map((z) => {
        const show = hoverZones.includes(z);
        return (
          <div
            key={`hover-fill-zone-${z}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...zoneFeatherMaskStyle(z),
              background: zoneHoverFillColor(mode),
              opacity: show ? 1 : 0,
              transition: 'opacity 150ms ease',
            }}
          />
        );
      })}
      {ADJACENT_PAIRS.map((p) => {
        const show =
          hoverPair !== null &&
          hoverPair.upper === p.upper &&
          hoverPair.lower === p.lower;
        return (
          <div
            key={`hover-fill-pair-${p.upper}-${p.lower}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...pairFeatherMaskStyle(p),
              background: zoneHoverFillColor(mode),
              opacity: show ? 1 : 0,
              transition: 'opacity 150ms ease',
            }}
          />
        );
      })}

      {(visibleFilledZones.length > 0 ||
        (showHoverOutline && hover)) && (
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id="kombats-zone-outline-attack"
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
              <feFlood floodColor={ATTACK_FLOOD} result="flood" />
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
              id="kombats-zone-outline-block"
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
              <feFlood floodColor={BLOCK_FLOOD} result="flood" />
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
              id="kombats-zone-hover-attack"
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
                floodColor={ATTACK_FLOOD}
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
            <filter
              id="kombats-zone-hover-block"
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
                floodColor={BLOCK_FLOOD}
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
            {BODY_ZONES.map((z) => {
              const stops = zoneFeatherSvgStops(z);
              return (
                <g key={`mask-${z}`}>
                  <linearGradient
                    id={`kombats-zone-grad-${z}`}
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
                    id={`kombats-zone-mask-${z}`}
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
                      fill={`url(#kombats-zone-grad-${z})`}
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
                    id={`kombats-pair-grad-${id}`}
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
                    id={`kombats-pair-mask-${id}`}
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
                      fill={`url(#kombats-pair-grad-${id})`}
                    />
                  </mask>
                </g>
              );
            })}
          </defs>
          {filledItems.map((item) => {
            const maskId =
              item.kind === 'single'
                ? `kombats-zone-mask-${item.zone}`
                : `kombats-pair-mask-${item.pair.upper}-${item.pair.lower}`;
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
                mask={`url(#${maskId})`}
                filter={`url(#kombats-zone-outline-${mode})`}
                style={{
                  animation:
                    'kombats-zone-pulse 2.5s ease-in-out infinite',
                }}
              />
            );
          })}
          {showHoverOutline && hover && (
            <image
              key={`hover-${hover}`}
              href={silhouetteSrc}
              x="0"
              y="0"
              width="100"
              height="100"
              preserveAspectRatio="none"
              mask={`url(#kombats-zone-mask-${hover})`}
              filter={`url(#kombats-zone-hover-${mode})`}
              style={{
                animation: 'kombats-zone-outline-in 150ms ease-out',
              }}
            />
          )}
        </svg>
      )}

      {BODY_ZONES.map((z) => {
        const { top, bottom } = ZONE_BANDS[z];
        return (
          <button
            key={`${z}-hit`}
            type="button"
            onMouseEnter={() => setHover(z)}
            onMouseLeave={() => setHover((h) => (h === z ? null : h))}
            onFocus={() => setHover(z)}
            onBlur={() => setHover((h) => (h === z ? null : h))}
            onClick={() => handleClick(z)}
            aria-label={`${mode === 'attack' ? 'Attack' : 'Block'} ${z}`}
            className="absolute left-0 right-0 cursor-pointer focus:outline-none"
            style={{
              top: `${top}%`,
              height: `${bottom - top}%`,
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
          />
        );
      })}
    </>
  );

  const attackValue = attack ?? 'Select zone';
  const blockValue = block ?? 'Select zones';

  const attackInfoRow = (
    <div>
      <Label tone="attack">ATTACK</Label>
      <div style={VALUE_STYLE}>{attackValue}</div>
    </div>
  );

  const blockInfoRow = (
    <div>
      <Label tone="block">BLOCK</Label>
      <div style={VALUE_STYLE}>{blockValue}</div>
    </div>
  );

  // Silhouette column — simple relative wrapper sized to width × 1.5·width.
  // All visual environment (soft backdrop, tactical grid, base silhouette)
  // lives inside `silhouetteBase` per the c6837dd stack order; zone fills,
  // outlines, and hit areas layer on top via `silhouetteOverlays`.
  const silhouetteStage = (
    <div
      className="relative select-none"
      style={{ width, height }}
    >
      {silhouetteBase}
      {silhouetteOverlays}
    </div>
  );

  return (
    <div ref={rootRef} className={className}>
      <style>{ZONE_ANIMATION_CSS}</style>

      {/* Plain-text tab row — gold underline on active, no borders,
          no background cards. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
          marginBottom: space.lg,
        }}
      >
        <ModeTab
          active={mode === 'attack'}
          onClick={() => setMode('attack')}
          icon={<Sword size={14} />}
          label="ATTACK"
        />
        <ModeTab
          active={mode === 'block'}
          onClick={() => setMode('block')}
          icon={<Shield size={14} />}
          label="BLOCK"
        />
      </div>

      {isSplit ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '55fr 45fr',
            gap: space.lg,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {silhouetteStage}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
            {attackInfoRow}
            {blockInfoRow}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {silhouetteStage}
          </div>

          <div
            style={{
              marginTop: space.lg,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: space.lg,
            }}
          >
            {attackInfoRow}
            {blockInfoRow}
          </div>
        </>
      )}

      {action && (
        <>
          <Divider marginY="md" />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {action}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Internal ----------

const ZONE_ANIMATION_CSS = `
  @keyframes kombats-zone-pulse {
    0%, 100% { opacity: 0.8; }
    50%      { opacity: 1; }
  }
  @keyframes kombats-zone-outline-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

interface ModeTabProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ModeTab({ active, onClick, icon, label }: ModeTabProps) {
  const [hovered, setHovered] = useState(false);
  const color = active
    ? accent.text
    : hovered
      ? text.secondary
      : text.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active
          ? `1px solid ${accent.primary}`
          : '1px solid transparent',
        padding: `0 0 ${space.xs} 0`,
        color,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: space.sm,
        fontSize: typography.labelLarge.fontSize,
        letterSpacing: typography.labelLarge.letterSpacing,
        textTransform: typography.labelLarge.textTransform,
        fontWeight: typography.labelLarge.fontWeight,
        transition: 'color 120ms ease',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
