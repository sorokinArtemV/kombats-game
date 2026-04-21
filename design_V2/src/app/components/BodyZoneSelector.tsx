import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Sword, Shield } from 'lucide-react';
import silhouetteSrc from '../../assets/fighters/silhouette.png';
import { Divider, Label } from '../../design-system/primitives';
import { accent, semantic, space, text, typography } from '../../design-system/tokens';

// Silhouette stack (inside the width × width*1.5 wrapper, bottom → top):
//   1. Soft backdrop             — faint warm radial glow behind the body.
//   2. Base silhouette           — dark fill, warm edge glow.
//   3. Per-zone FILL overlays    — silhouette-masked, clipped to each
//                                   zone's y-band, radial gradient, pulse.
//                                   Only the current mode's selections.
//   4. SVG outline+glow layer    — feMorphology-derived outline + outer
//                                   glow on selected zones, hairline-only
//                                   on hover preview.
//   5. Hit areas                 — full-width rectangles per zone y-band.

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
  hInset: number;
}

const ZONE_BANDS: Record<BodyZone, ZoneBand> = {
  Head: { top: 4, bottom: 20, hInset: 0 },
  Chest: { top: 20, bottom: 40, hInset: 0 },
  Stomach: { top: 40, bottom: 49, hInset: 0 },
  Waist: { top: 49, bottom: 73, hInset: 0 },
  Legs: { top: 73, bottom: 91, hInset: 0 },
};

function zoneInsetString(z: BodyZone): string {
  const { top, bottom, hInset } = ZONE_BANDS[z];
  return `inset(${top}% ${hInset}% ${100 - bottom}% ${hInset}%)`;
}

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

function zoneOutlineClipRect(z: BodyZone): { y: number; height: number } {
  const { top, bottom } = ZONE_BANDS[z];
  const topExtra = z === 'Head' ? 10 : 0;
  const bottomExtra = z === 'Legs' ? 10 : 0;
  return {
    y: top - topExtra,
    height: bottom - top + topExtra + bottomExtra,
  };
}

type Mode = 'attack' | 'block';

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

  const blockZones = block ? blockPairZones(block) : null;
  const height = Math.round(width * 1.5);

  const handleClick = (z: BodyZone) => {
    if (mode === 'attack') onAttackChange(z);
    else onBlockChange(ZONE_TO_BLOCK_PAIR[z]);
  };

  const visibleFilledZones: BodyZone[] =
    mode === 'attack'
      ? attack
        ? [attack]
        : []
      : blockZones
        ? [...blockZones]
        : [];

  const modeFillRgb = mode === 'attack' ? ATTACK_FILL_RGB : BLOCK_FILL_RGB;

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
      {visibleFilledZones.map((z) => {
        const clip = zoneInsetString(z);
        return (
          <div
            key={`fill-${z}`}
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              ...silhouetteMaskStyle,
              clipPath: clip,
              WebkitClipPath: clip,
              background: zoneFillBackground(modeFillRgb),
              animation:
                'kombats-zone-pulse 2.5s ease-in-out infinite',
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
              const { y, height } = zoneOutlineClipRect(z);
              return (
                <clipPath
                  key={`clip-${z}`}
                  id={`kombats-zone-clip-${z}`}
                  clipPathUnits="userSpaceOnUse"
                >
                  <rect x="0" y={y} width="100" height={height} />
                </clipPath>
              );
            })}
          </defs>
          {visibleFilledZones.map((z) => (
            <image
              key={`outline-${z}`}
              href={silhouetteSrc}
              x="0"
              y="0"
              width="100"
              height="100"
              preserveAspectRatio="none"
              clipPath={`url(#kombats-zone-clip-${z})`}
              filter={`url(#kombats-zone-outline-${mode})`}
              style={{
                animation:
                  'kombats-zone-pulse 2.5s ease-in-out infinite',
              }}
            />
          ))}
          {showHoverOutline && hover && (
            <image
              key={`hover-${hover}`}
              href={silhouetteSrc}
              x="0"
              y="0"
              width="100"
              height="100"
              preserveAspectRatio="none"
              clipPath={`url(#kombats-zone-clip-${hover})`}
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
