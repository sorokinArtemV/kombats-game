import { useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import silhouetteSrc from '../../assets/fighters/silhouette.png';
import mitsudamoeSrc from '../../assets/icons/mitsudamoe.png';
import { Button } from '../../design-system/primitives';
import { border, radius, semantic, space, surface, text } from '../../design-system/tokens';

// Diptych: two independent silhouettes side-by-side, one for ATTACK
// (opponent) and one for BLOCK (you). Each silhouette is a
// SilhouetteStage instance with its own fixed mode and its own hover
// state — the hover-gap adjacency logic runs per stage and never
// crosses between them. Selection state is owned by the parent
// (BodyZoneSelector) and threaded down to the appropriate stage.
//
// Per-silhouette stack (inside the width × width*1.5 wrapper, bottom → top):
//   1. Soft backdrop             — faint warm radial glow behind the body.
//   2. Tactical grid             — gold dot pattern with radial vignette.
//   3. Base silhouette           — dark fill, warm edge glow.
//   4. Selection FILL overlays   — silhouette-masked AND feather-masked,
//                                   radial gradient, pulse. Attack mode
//                                   renders one per-zone item; block mode
//                                   renders one *paired* item spanning
//                                   both zones with feather only on the
//                                   outer edges (so adjacent zones don't
//                                   produce a transparent seam). The
//                                   non-adjacent 'Legs & Head' pair falls
//                                   back to two independent singles.
//   5. Per-zone HOVER fill       — always mounted, opacity 0 except on
//                                   the hovered-and-not-selected zone;
//                                   flat fill, same feather mask, 150ms
//                                   opacity transition for fade in/out.
//   6. SVG outline+glow layer    — feMorphology-derived outline + outer
//                                   glow on selected zones, hairline-only
//                                   on hover preview. Masked by a vertical
//                                   linearGradient so the outline feathers
//                                   at the band edges instead of
//                                   terminating on a rect clip line.
//   7. Hit areas                 — full-width rectangles per zone y-band.

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
// (downward neighbour). Legs wraps back to Head to match the existing
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

// Hard edges on a zone or pair mask: each side independently replaces its
// feather ramp with a zero-width transparent→black transition. Used by
// the hover path so a hover fill can sit flush against an adjacent
// selected fill without a partially-opacified seam. Both sides can be
// hard simultaneously (e.g., a hover zone sandwiched between two selected
// neighbours).
interface HardEdges {
  top?: boolean;
  bottom?: boolean;
}

// Per-side feather distance of the ADJACENT selected zone, shifted past
// the band boundary so the hover fill overlaps the selection's feather
// ramp on the other side of the shared boundary. The selection's own
// feather then fades smoothly under a fully-opaque hover fill — no gap.
interface NeighbourFeathers {
  top?: number;
  bottom?: number;
}

// Vertical mask gradient for a zone. Stops are in container-% space (0% =
// top of silhouette container, 100% = bottom) so a single full-container
// linear-gradient can be composited with the silhouette PNG mask via
// mask-composite: intersect.
function zoneFeatherGradient(
  z: BodyZone,
  hardEdges: HardEdges = {},
  neighbourFeathers: NeighbourFeathers = {},
): string {
  const { top, bottom } = ZONE_BANDS[z];
  const feather = (bottom - top) * ZONE_FEATHER_FRACTION;
  const stops: string[] = [];

  // Top edge: silhouette head-contour, band-internal hard jump, or feather.
  if (z === 'Head') {
    // Silhouette edge — no fade off the top of the head.
    stops.push('black 0%');
  } else if (hardEdges.top) {
    const cut = top - (neighbourFeathers.top ?? 0);
    stops.push('transparent 0%', `transparent ${cut}%`, `black ${cut}%`);
  } else {
    stops.push('transparent 0%', `transparent ${top}%`, `black ${top + feather}%`);
  }

  // Bottom edge: silhouette boot-contour, band-internal hard jump, or feather.
  if (z === 'Legs') {
    // Silhouette edge — no fade off the boots.
    stops.push('black 100%');
  } else if (hardEdges.bottom) {
    const cut = bottom + (neighbourFeathers.bottom ?? 0);
    stops.push(`black ${cut}%`, `transparent ${cut}%`, 'transparent 100%');
  } else {
    stops.push(`black ${bottom - feather}%`, `transparent ${bottom}%`, 'transparent 100%');
  }

  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

// Two-mask style for zone overlays: silhouette PNG × feather gradient,
// composited with intersect so the fill follows the body shape AND fades
// at the band's top/bottom.
function zoneFeatherMaskStyle(
  z: BodyZone,
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

// Vertical neighbour lookups derived from BODY_ZONES ordering (top →
// bottom). Used to detect when a hover target sits directly above/below
// a selected zone and therefore needs a hard edge extended into the
// selection's feather ramp.
function zoneAbove(z: BodyZone): BodyZone | null {
  const i = BODY_ZONES.indexOf(z);
  return i > 0 ? BODY_ZONES[i - 1] : null;
}
function zoneBelow(z: BodyZone): BodyZone | null {
  const i = BODY_ZONES.indexOf(z);
  return i >= 0 && i < BODY_ZONES.length - 1 ? BODY_ZONES[i + 1] : null;
}

// Per-zone feather distance in container-% units. Matches the same
// formula every gradient builder uses — exposed as a helper so overlap
// logic can look up the adjacent (selected) zone's feather and hand it
// to the gradient builder as `neighbourFeathers.{top,bottom}`.
function zoneFeatherAmount(z: BodyZone): number {
  const { top, bottom } = ZONE_BANDS[z];
  return (bottom - top) * ZONE_FEATHER_FRACTION;
}

// Pair mask. Interior boundary between upper and lower stays feather-less
// (continuous black). `hardEdges.top` applies to the pair's outer TOP
// (top of the upper zone); `hardEdges.bottom` applies to the pair's outer
// BOTTOM (bottom of the lower zone). `neighbourFeathers` supplies the
// feather amount of the selected zone sitting on the other side of each
// outer edge so the hard edge overlaps that feather and closes the gap.
function pairFeatherGradient(
  { upper, lower }: ZonePair,
  hardEdges: HardEdges = {},
  neighbourFeathers: NeighbourFeathers = {},
): string {
  const ub = ZONE_BANDS[upper];
  const lb = ZONE_BANDS[lower];
  const upperFeather = (ub.bottom - ub.top) * ZONE_FEATHER_FRACTION;
  const lowerFeather = (lb.bottom - lb.top) * ZONE_FEATHER_FRACTION;
  const stops: string[] = [];

  if (upper === 'Head') {
    stops.push('black 0%');
  } else if (hardEdges.top) {
    const cut = ub.top - (neighbourFeathers.top ?? 0);
    stops.push('transparent 0%', `transparent ${cut}%`, `black ${cut}%`);
  } else {
    stops.push(
      'transparent 0%',
      `transparent ${ub.top}%`,
      `black ${ub.top + upperFeather}%`,
    );
  }

  if (lower === 'Legs') {
    stops.push('black 100%');
  } else if (hardEdges.bottom) {
    const cut = lb.bottom + (neighbourFeathers.bottom ?? 0);
    stops.push(`black ${cut}%`, `transparent ${cut}%`, 'transparent 100%');
  } else {
    stops.push(
      `black ${lb.bottom - lowerFeather}%`,
      `transparent ${lb.bottom}%`,
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

// Per-column selection readout — rendered directly under the silhouette
// image inside each column wrapper. Two states, visually distinct so the
// empty placeholder never reads as a committed choice:
//   - PLACEHOLDER: muted, italic, 400 weight — clearly "nothing chosen"
//   - SELECTED:    semantic tone (attack / block), 600 weight, uppercase
const SELECTION_PLACEHOLDER_STYLE: CSSProperties = {
  fontSize: 13,
  color: text.muted,
  fontStyle: 'italic',
  fontWeight: 400,
  letterSpacing: '0.04em',
  textAlign: 'center',
  marginTop: space.sm,
};

const SELECTION_VALUE_STYLE_BASE: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  textAlign: 'center',
  marginTop: space.sm,
};

const SELECTION_VALUE_STYLE_ATTACK: CSSProperties = {
  ...SELECTION_VALUE_STYLE_BASE,
  color: semantic.attack.text,
};

const SELECTION_VALUE_STYLE_BLOCK: CSSProperties = {
  ...SELECTION_VALUE_STYLE_BASE,
  color: semantic.block.text,
};

// Small right-angle corner marks that claim each silhouette column's
// territory. Attack column gets red marks on its left side; block
// column gets green marks on its right side. ~0.35 opacity so they
// frame without shouting.
const CORNER_ARM_PX = 14;
const CORNER_THICKNESS_PX = 1.5;
const ATTACK_CORNER_COLOR = 'rgba(192, 55, 68, 0.35)';
const BLOCK_CORNER_COLOR = 'rgba(90, 138, 122, 0.35)';

function CornerMark({
  color,
  position,
}: {
  color: string;
  position: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const style: CSSProperties = {
    position: 'absolute',
    width: CORNER_ARM_PX,
    height: CORNER_ARM_PX,
    pointerEvents: 'none',
  };
  if (position === 'tl') {
    style.top = 0;
    style.left = 0;
    style.borderTop = `${CORNER_THICKNESS_PX}px solid ${color}`;
    style.borderLeft = `${CORNER_THICKNESS_PX}px solid ${color}`;
  } else if (position === 'tr') {
    style.top = 0;
    style.right = 0;
    style.borderTop = `${CORNER_THICKNESS_PX}px solid ${color}`;
    style.borderRight = `${CORNER_THICKNESS_PX}px solid ${color}`;
  } else if (position === 'bl') {
    style.bottom = 0;
    style.left = 0;
    style.borderBottom = `${CORNER_THICKNESS_PX}px solid ${color}`;
    style.borderLeft = `${CORNER_THICKNESS_PX}px solid ${color}`;
  } else {
    style.bottom = 0;
    style.right = 0;
    style.borderBottom = `${CORNER_THICKNESS_PX}px solid ${color}`;
    style.borderRight = `${CORNER_THICKNESS_PX}px solid ${color}`;
  }
  return <div aria-hidden style={style} />;
}

// Ceremonial header above each silhouette. Cinzel + wide tracking
// matches the panel's serif-Roman aesthetic; deliberately NOT the
// small-caps Label primitive, which is for short tone-coded inline
// labels rather than column-anchoring headings. Tone-coloured text +
// matching warm shadow keep attack/block channels distinct.
const SILHOUETTE_HEADER_STYLE_BASE: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  fontWeight: 600,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  lineHeight: 1,
  textAlign: 'center',
};

const ATTACK_HEADER_STYLE: CSSProperties = {
  ...SILHOUETTE_HEADER_STYLE_BASE,
  color: semantic.attack.text,
  textShadow: '0 2px 14px rgba(192, 55, 68, 0.35)',
};

const BLOCK_HEADER_STYLE: CSSProperties = {
  ...SILHOUETTE_HEADER_STYLE_BASE,
  color: semantic.block.text,
  textShadow: '0 2px 14px rgba(90, 138, 122, 0.35)',
};

// ---------- Waiting state ----------
//
// After LOCK IN, the player can no longer interact with the silhouettes
// and must wait for the opponent to commit. The panel chrome (title,
// meta row, timer) stays visible so the opponent's remaining time is
// legible. Only the combat zone's children and the footer action swap.
//
// Composition, back to front:
//   1. Soft circular radial glow (320px, static)
//   2. Counter-rotating hairline ring (220px, -360° over 12s)
//   3. Mitsudomoe icon (140px, 360° over 8s) — mix-blend-mode: screen
//      drops the PNG's dark background into the glassSubtle surface so
//      only the gold figure reads.

const MITSUDOMOE_ICON_PX = 140;
const MITSUDOMOE_GLOW_PX = 320;
const MITSUDOMOE_RING_PX = 220;

const WAITING_STAGE_STYLE: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const WAITING_ICON_GLOW_STYLE: CSSProperties = {
  position: 'absolute',
  width: MITSUDOMOE_GLOW_PX,
  height: MITSUDOMOE_GLOW_PX,
  borderRadius: '50%',
  background:
    'radial-gradient(circle, rgba(201, 162, 90, 0.18) 0%, rgba(201, 162, 90, 0.08) 35%, rgba(201, 162, 90, 0.03) 60%, transparent 80%)',
  pointerEvents: 'none',
};

const WAITING_ICON_RING_STYLE: CSSProperties = {
  position: 'absolute',
  width: MITSUDOMOE_RING_PX,
  height: MITSUDOMOE_RING_PX,
  borderRadius: '50%',
  border: '1px solid rgba(201, 162, 90, 0.15)',
  pointerEvents: 'none',
};

const WAITING_ICON_STYLE: CSSProperties = {
  width: MITSUDOMOE_ICON_PX,
  height: MITSUDOMOE_ICON_PX,
  opacity: 0.5,
  mixBlendMode: 'screen',
  pointerEvents: 'none',
};

// ---------- Component ----------

interface BodyZoneSelectorProps {
  attack: BodyZone | null;
  block: BlockPair | null;
  onAttackChange: (zone: BodyZone) => void;
  onBlockChange: (pair: BlockPair) => void;
  className?: string;
  /** Visual size of EACH silhouette body (width in px). Height is 1.5x. */
  width?: number;
  /**
   * Optional node rendered below the diptych — typically the LOCK IN
   * button. Centered horizontally; no width stretching. Ignored when
   * `isWaiting` is true — the component renders its own confirmation
   * button instead.
   */
  action?: React.ReactNode;
  /**
   * When true, the panel enters its post-lock-in waiting state: the
   * silhouette columns are replaced with a quiet mitsudomoe centerpiece
   * and the footer swaps to a "LOCKED IN ✓" confirmation. The outer
   * glassSubtle container dimensions are preserved so the parent panel
   * does not jump size between phases.
   */
  isWaiting?: boolean;
}

export function BodyZoneSelector({
  attack,
  block,
  onAttackChange,
  onBlockChange,
  className,
  width = 200,
  action,
  isWaiting = false,
}: BodyZoneSelectorProps) {
  // Column wrapper — pack content to the top so the silhouette sits
  // directly under its header and the selection readout nests flush
  // beneath it, with no dead vertical gap above the header.
  const columnWrapperStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  };

  // Silhouette column's rendered height, derived so the waiting state
  // can match it exactly and the panel never jumps size between phases.
  //   pt(4) + header(18) + gap(8) + silhouette(width*1.5) + gap(8)
  //   + selection label wrapper(marginTop 8 + ~16px text) + pb(8)
  const silhouetteHeightPx = Math.round(width * 1.5);
  const columnContentHeightPx = 4 + 18 + 8 + silhouetteHeightPx + 8 + 24 + 8;

  const combatZoneStyle: CSSProperties = {
    background: surface.glassSubtle,
    borderRadius: radius.sm,
    border: border.subtle,
    padding: `${space.sm} ${space.md}`,
    display: 'flex',
    justifyContent: 'center',
    gap: space.md,
  };

  return (
    <div className={className}>
      <style>{ZONE_ANIMATION_CSS}</style>

      {/* Glass-in-glass combat zone — a subtle inset surface behind the
          two silhouettes (or the waiting centerpiece, post-lock-in).
          Container dimensions stay identical across both states so the
          panel never jumps size when the turn phase switches. */}
      <div style={combatZoneStyle}>
        {isWaiting ? (
          <div
            style={{
              flex: 1,
              minHeight: columnContentHeightPx,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <div style={WAITING_STAGE_STYLE}>
              <div aria-hidden style={WAITING_ICON_GLOW_STYLE} />
              <motion.div
                aria-hidden
                style={WAITING_ICON_RING_STYLE}
                animate={{ rotate: -360 }}
                transition={{
                  duration: 12,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
              <motion.img
                src={mitsudamoeSrc}
                alt=""
                aria-hidden
                style={WAITING_ICON_STYLE}
                animate={{ rotate: 360 }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div style={{ ...columnWrapperStyle, flex: 1 }}>
              <CornerMark color={ATTACK_CORNER_COLOR} position="tl" />
              <CornerMark color={ATTACK_CORNER_COLOR} position="bl" />
              <h3 style={ATTACK_HEADER_STYLE}>ATTACK</h3>
              <SilhouetteStage
                mode="attack"
                attack={attack}
                onAttackChange={onAttackChange}
                width={width}
              />
              {attack ? (
                <div style={SELECTION_VALUE_STYLE_ATTACK}>{attack}</div>
              ) : (
                <div style={SELECTION_PLACEHOLDER_STYLE}>Select zone</div>
              )}
            </div>

            <div style={{ ...columnWrapperStyle, flex: 1 }}>
              <CornerMark color={BLOCK_CORNER_COLOR} position="tr" />
              <CornerMark color={BLOCK_CORNER_COLOR} position="br" />
              <h3 style={BLOCK_HEADER_STYLE}>BLOCK</h3>
              <SilhouetteStage
                mode="block"
                block={block}
                onBlockChange={onBlockChange}
                width={width}
              />
              {block ? (
                <div style={SELECTION_VALUE_STYLE_BLOCK}>{block}</div>
              ) : (
                <div style={SELECTION_PLACEHOLDER_STYLE}>Select pair</div>
              )}
            </div>
          </>
        )}
      </div>

      {(action || isWaiting) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: space.sm,
            paddingBottom: space.sm,
          }}
        >
          {isWaiting ? (
            <Button
              variant="ghost"
              size="md"
              disabled
              style={{ cursor: 'default' }}
            >
              Locked In ✓
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}

// ---------- SilhouetteStage ----------

// Discriminated union: each instance is fixed to one mode and only the
// relevant selection + setter for that mode are passed in. The other
// mode's state never enters this subtree, so the two stages never
// influence each other — independent hover, independent selection,
// independent hover-gap adjacency.
type SilhouetteStageProps = { width: number } & (
  | { mode: 'attack'; attack: BodyZone | null; onAttackChange: (zone: BodyZone) => void }
  | { mode: 'block'; block: BlockPair | null; onBlockChange: (pair: BlockPair) => void }
);

function SilhouetteStage(props: SilhouetteStageProps) {
  const { mode, width } = props;
  const [hover, setHover] = useState<BodyZone | null>(null);
  const height = Math.round(width * 1.5);

  // Attack mode selects one zone → one single item. Block mode selects a
  // pair; adjacent pairs render as ONE pair item so the shared boundary
  // has no feather-induced transparent seam. The wraparound 'Legs & Head'
  // pair is non-adjacent and falls back to two singles.
  const filledItems: FilledItem[] = (() => {
    if (props.mode === 'attack') {
      return props.attack ? [{ kind: 'single', zone: props.attack }] : [];
    }
    if (!props.block) return [];
    const pair = adjacentBlockPair(props.block);
    if (pair) return [{ kind: 'pair', pair }];
    const [z1, z2] = blockPairZones(props.block);
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
  // falls back to two singles. Selection takes priority over hover:
  //   - If the hovered pair is the currently selected pair, nothing
  //     previews.
  //   - If the hovered pair shares ONE zone with the selected pair
  //     (overlap), hover renders only on the non-shared zone.
  // After the render targets are chosen, a uniform adjacency pass runs
  // against `visibleFilledZones`: any target whose outer edge touches a
  // currently-selected zone gets a hard edge extended by that neighbour's
  // feather amount, so hover and selection meet flush with no seam.
  const {
    hoverPair,
    hoverZones,
    hoverZoneHardEdges,
    hoverZoneNeighbourFeathers,
    hoverPairHardEdges,
    hoverPairNeighbourFeathers,
  } = ((): {
    hoverPair: ZonePair | null;
    hoverZones: BodyZone[];
    hoverZoneHardEdges: Partial<Record<BodyZone, HardEdges>>;
    hoverZoneNeighbourFeathers: Partial<Record<BodyZone, NeighbourFeathers>>;
    hoverPairHardEdges: HardEdges;
    hoverPairNeighbourFeathers: NeighbourFeathers;
  } => {
    const empty = {
      hoverPair: null as ZonePair | null,
      hoverZones: [] as BodyZone[],
      hoverZoneHardEdges: {} as Partial<Record<BodyZone, HardEdges>>,
      hoverZoneNeighbourFeathers: {} as Partial<Record<BodyZone, NeighbourFeathers>>,
      hoverPairHardEdges: {} as HardEdges,
      hoverPairNeighbourFeathers: {} as NeighbourFeathers,
    };
    if (hover === null) return empty;

    // 1. Decide what to render: attack single, block pair, block overlap
    //    (partial pair), or block wraparound (two singles).
    let renderPair: ZonePair | null = null;
    let renderZones: BodyZone[] = [];
    if (props.mode === 'attack') {
      if (props.attack === hover) return empty;
      renderZones = [hover];
    } else {
      const hoverPairKey = ZONE_TO_BLOCK_PAIR[hover];
      if (props.block === hoverPairKey) return empty;
      const [z1, z2] = blockPairZones(hoverPairKey);
      const overlap1 = visibleFilledZones.includes(z1);
      const overlap2 = visibleFilledZones.includes(z2);
      if (overlap1 || overlap2) {
        if (!overlap1) renderZones.push(z1);
        if (!overlap2) renderZones.push(z2);
      } else {
        const adj = adjacentBlockPair(hoverPairKey);
        if (adj) renderPair = adj;
        else renderZones = [z1, z2];
      }
    }

    // 2. Adjacency pass: for each render target, if its outer edge touches
    //    a selected zone, record a hard edge and the neighbour's feather.
    const zoneHardEdges: Partial<Record<BodyZone, HardEdges>> = {};
    const zoneNeighbourFeathers: Partial<Record<BodyZone, NeighbourFeathers>> = {};
    for (const z of renderZones) {
      const above = zoneAbove(z);
      const below = zoneBelow(z);
      const edges: HardEdges = {};
      const feathers: NeighbourFeathers = {};
      if (above && visibleFilledZones.includes(above)) {
        edges.top = true;
        feathers.top = zoneFeatherAmount(above);
      }
      if (below && visibleFilledZones.includes(below)) {
        edges.bottom = true;
        feathers.bottom = zoneFeatherAmount(below);
      }
      if (edges.top || edges.bottom) {
        zoneHardEdges[z] = edges;
        zoneNeighbourFeathers[z] = feathers;
      }
    }

    const pairHardEdges: HardEdges = {};
    const pairNeighbourFeathers: NeighbourFeathers = {};
    if (renderPair) {
      const above = zoneAbove(renderPair.upper);
      const below = zoneBelow(renderPair.lower);
      if (above && visibleFilledZones.includes(above)) {
        pairHardEdges.top = true;
        pairNeighbourFeathers.top = zoneFeatherAmount(above);
      }
      if (below && visibleFilledZones.includes(below)) {
        pairHardEdges.bottom = true;
        pairNeighbourFeathers.bottom = zoneFeatherAmount(below);
      }
    }

    return {
      hoverPair: renderPair,
      hoverZones: renderZones,
      hoverZoneHardEdges: zoneHardEdges,
      hoverZoneNeighbourFeathers: zoneNeighbourFeathers,
      hoverPairHardEdges: pairHardEdges,
      hoverPairNeighbourFeathers: pairNeighbourFeathers,
    };
  })();

  // Hover outline targets: mirrors the selection outline's kind-branch
  // so pair hovers render a single pair-masked <image> (outline on both
  // zones) while overlap / wraparound / attack mode render one
  // per-zone <image>. The anchor-only `showHoverOutline` gate was
  // dropping the second zone of every pair hover.
  type HoverOutlineTargets =
    | { kind: 'pair'; pair: ZonePair }
    | { kind: 'zones'; zones: BodyZone[] }
    | null;
  const hoverOutlineTargets: HoverOutlineTargets = ((): HoverOutlineTargets => {
    if (hover === null) return null;
    if (props.mode === 'attack') {
      if (props.attack === hover) return null;
      return { kind: 'zones', zones: [hover] };
    }
    if (hoverPair) return { kind: 'pair', pair: hoverPair };
    if (hoverZones.length > 0) return { kind: 'zones', zones: hoverZones };
    return null;
  })();

  const handleClick = (z: BodyZone) => {
    if (props.mode === 'attack') props.onAttackChange(z);
    else props.onBlockChange(ZONE_TO_BLOCK_PAIR[z]);
  };

  // SVG IDs are namespaced by mode so the two stages mounted side-by-
  // side don't collide on globally-scoped SVG IDs (filter / mask /
  // gradient lookups resolve via document-wide ID, not SVG-local).
  const filterId = `kombats-zone-outline-${mode}`;
  const hoverFilterId = `kombats-zone-hover-${mode}`;
  const zoneMaskId = (z: BodyZone) => `kombats-zone-mask-${mode}-${z}`;
  const zoneGradId = (z: BodyZone) => `kombats-zone-grad-${mode}-${z}`;
  const pairMaskId = (id: string) => `kombats-pair-mask-${mode}-${id}`;
  const pairGradId = (id: string) => `kombats-pair-grad-${mode}-${id}`;
  const flood = mode === 'attack' ? ATTACK_FLOOD : BLOCK_FLOOD;
  const ariaPrefix = mode === 'attack' ? 'Attack' : 'Block';

  return (
    <div className="relative select-none" style={{ width, height }}>
      {/* Soft backdrop — warm gold radial glow, extends past silhouette bounds. */}
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

      {/* Selection fill overlays */}
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
          switching between hovered zones. */}
      {BODY_ZONES.map((z) => {
        const show = hoverZones.includes(z);
        const hardEdges = hoverZoneHardEdges[z] ?? {};
        const neighbourFeathers = hoverZoneNeighbourFeathers[z] ?? {};
        return (
          <div
            key={`hover-fill-zone-${z}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...zoneFeatherMaskStyle(z, hardEdges, neighbourFeathers),
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
        // Adjacency-driven hard edges only apply to the currently active
        // hover pair; the other three stay with default feather behaviour
        // so they fade out cleanly if still visible mid-transition.
        const hardEdges = show ? hoverPairHardEdges : {};
        const neighbourFeathers = show ? hoverPairNeighbourFeathers : {};
        return (
          <div
            key={`hover-fill-pair-${p.upper}-${p.lower}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...pairFeatherMaskStyle(p, hardEdges, neighbourFeathers),
              background: zoneHoverFillColor(mode),
              opacity: show ? 1 : 0,
              transition: 'opacity 150ms ease',
            }}
          />
        );
      })}

      {(visibleFilledZones.length > 0 || hoverOutlineTargets !== null) && (
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
              id={filterId}
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
            {BODY_ZONES.map((z) => {
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
                  animation:
                    'kombats-zone-pulse 2.5s ease-in-out infinite',
                }}
              />
            );
          })}
          {hoverOutlineTargets?.kind === 'pair' && (
            <image
              key={`hover-pair-${hoverOutlineTargets.pair.upper}-${hoverOutlineTargets.pair.lower}`}
              href={silhouetteSrc}
              x="0"
              y="0"
              width="100"
              height="100"
              preserveAspectRatio="none"
              mask={`url(#${pairMaskId(`${hoverOutlineTargets.pair.upper}-${hoverOutlineTargets.pair.lower}`)})`}
              filter={`url(#${hoverFilterId})`}
              style={{
                animation: 'kombats-zone-outline-in 150ms ease-out',
              }}
            />
          )}
          {hoverOutlineTargets?.kind === 'zones' &&
            hoverOutlineTargets.zones.map((z) => (
              <image
                key={`hover-${z}`}
                href={silhouetteSrc}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="none"
                mask={`url(#${zoneMaskId(z)})`}
                filter={`url(#${hoverFilterId})`}
                style={{
                  animation: 'kombats-zone-outline-in 150ms ease-out',
                }}
              />
            ))}
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
            aria-label={`${ariaPrefix} ${z}`}
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
