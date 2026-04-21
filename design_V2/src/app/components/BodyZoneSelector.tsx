import { useEffect, useRef, useState } from 'react';
import { Sword, Shield } from 'lucide-react';
import silhouetteSrc from '../../assets/fighters/silhouette.png';
import { NinjaSmokeOverlay } from './NinjaSmokeOverlay.jsx';

// ---------- Layout modes ----------
//
// Silhouette stack (inside the width × width*1.5 wrapper, bottom → top):
//   1. Soft backdrop
//   2. Base silhouette (dark fill, warm edge glow)
//   3. NinjaSmokeOverlay
//   4. Per-zone FILL overlays   — silhouette-masked divs, vertically clipped
//                                 to each zone's y-band, radial-gradient bg,
//                                 pulse. Only the current mode's selected
//                                 zones render.
//   5. Hover OUTLINE overlay    — silhouette-masked div, same clip as
//                                 hovered zone, thin ring via drop-shadow
//                                 filter. Mode-coloured.
//   6. Hover tooltip label
//   7. Side markers             (outside wrapper, sword/shield)
//   8. Hit areas                (full-width rectangles per zone y-band)
//
//   STACKED  (default <520px, or layout="stacked")
//   SPLIT    (≥520px with layout="auto", or layout="split")

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
//
// Zones are NOT polygons any more. Each zone is described as:
//   - a vertical y-band (top%, bottom%) that `clip-path: inset(...)`
//     applies to a silhouette-masked <div>. The mask makes the fill
//     body-shaped automatically, for any silhouette.
//   - an optional horizontal inset (hInset%) applied on both sides of
//     that clip-path, used ONLY by Waist to keep the fill inside the
//     blade-free corridor (x 32..68 per the contour analysis — blades
//     extend outward from hands at y 50..62).
//
// Values below are percentages of container height / width.
//   inset top    = top%
//   inset bottom = (100 - bottom%)                         → see zoneInsetString()
//   inset left/right = hInset% (0 except for Waist)

interface ZoneBand {
  top: number;
  bottom: number;
  hInset: number;
}

const ZONE_BANDS: Record<BodyZone, ZoneBand> = {
  // Hood/face. Figure top (hood peak) sits at y ≈ 4 per the contour
  // analysis; shoulders flare in at y 20.
  Head: { top: 4, bottom: 20, hInset: 0 },

  // Pauldrons + upper torso. Arms detach from torso in y 35..45 but
  // the silhouette mask handles that automatically — fill only shows
  // where there are body pixels.
  Chest: { top: 20, bottom: 40, hInset: 0 },

  // Mid-torso abdomen, above the blade band.
  Stomach: { top: 40, bottom: 49, hInset: 0 },

  // Belt + hip armor + coat/skirt. Crosses the blade band (y 48..62),
  // so some minor blade tinting is unavoidable without rectangular
  // cutoffs — accepted in exchange for a clean body outline. Extends
  // down to y 73 so the armor skirt between belt and the top of the
  // legs is covered (no dead-band between Waist and Legs).
  Waist: { top: 49, bottom: 73, hInset: 0 },

  // Legs — starts at y 73 (directly meeting Waist bottom), covers
  // actual legs + boots only. The between-legs gap is transparent
  // in the silhouette PNG, so the mask carves it out automatically.
  Legs: { top: 73, bottom: 91, hInset: 0 },
};

function zoneInsetString(z: BodyZone): string {
  const { top, bottom, hInset } = ZONE_BANDS[z];
  // clip-path: inset(top% right% bottom% left%)
  return `inset(${top}% ${hInset}% ${100 - bottom}% ${hInset}%)`;
}

// Y-center of each zone — used to position the sword/shield side
// markers in the gutter.
const ZONE_CENTER_Y: Record<BodyZone, number> = {
  Head: 12,
  Chest: 30,
  Stomach: 45,
  Waist: 61,
  Legs: 82,
};

// Y-anchor for the hover tooltip — bottom of the pill sits ~4px above
// this row.
const ZONE_TOP_Y: Record<BodyZone, number> = {
  Head: 4,
  Chest: 20,
  Stomach: 40,
  Waist: 49,
  Legs: 73,
};

// Colors mirror the tokens used elsewhere in this file (rgba literals)
// so token migration (step 7d) is a single-file edit later.
const ATTACK_RGB = '192, 55, 68';
const BLOCK_RGB = '90, 138, 122';

const silhouetteMaskStyle: React.CSSProperties = {
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

// Clip-path rect for the SVG outline layer. Head's rect extends 10
// units above the silhouette top and Legs' rect extends 10 units
// below the silhouette bottom so the outer glow has room to bleed
// past the container's vertical extremes without being clipped by
// clipPath. No extra padding between adjacent zones — their bands
// stay discrete.
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
   * Optional node rendered below the summaries (stacked) or under the
   * Block summary in the right column (split). Typically a LOCK IN
   * button. Direct children are stretched to 100% width.
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

  // Zones visible in the current mode. Both attack and block selections
  // persist in props; mode filtering decides which render.
  const visibleFilledZones: BodyZone[] =
    mode === 'attack'
      ? attack
        ? [attack]
        : []
      : blockZones
        ? [...blockZones]
        : [];

  const modeRgb = mode === 'attack' ? ATTACK_RGB : BLOCK_RGB;

  // Hover overlay is suppressed when the hovered zone is already
  // selected in the current mode — the fill owns that visual.
  const showHoverOutline =
    hover !== null && !visibleFilledZones.includes(hover);

  // Lower silhouette layers — painted first, below the smoke overlay
  // in stacked mode.
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

      {/* Base silhouette — dark fill with a subtle warm edge glow. */}
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

  // Upper silhouette layers — zone fills, hover outline, tooltip,
  // side markers, hit areas.
  const silhouetteOverlays = (
    <>
      {/* Per-zone FILL — silhouette-masked div with the mode-coloured
          radial gradient, clipped to the zone's y-band and pulsing. */}
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
              background: zoneFillBackground(modeRgb),
              animation:
                'kombats-zone-pulse 2.5s ease-in-out infinite',
            }}
          />
        );
      })}

      {/* OUTLINE layer (SVG) — handles both the selected-zone full
          outline+glow+pulse AND the weaker hover-preview outline, on
          top of the radial fills. The filter dilates the silhouette
          alpha by 1 unit, subtracts the original to get a hairline
          ring, colours it via feFlood + feComposite, then the
          "outline" filters add a softer stdDeviation=4 blur and
          feMerge for an outer glow. The "hover" filters stop before
          the glow and use floodOpacity=0.5 for a weaker preview.

          clipPath per zone trims the filter output to the zone's
          y-band. Head and Legs clipPaths are extended 10 units past
          the silhouette container's outer edge (see
          zoneOutlineClipRect) so the outer glow at the top of the
          hood and bottom of the boots isn't cut off by the clip.

          NOTE: filter reads SourceAlpha BEFORE clip-path is applied
          (per SVG effect order: filter → clip-path → mask → opacity),
          so outlines are derived from the FULL silhouette edge and
          only then trimmed to the zone band — no horizontal rules
          across the torso at zone seams. */}
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
            {/* Selected-state filters (outline + outer glow). */}
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
              <feFlood floodColor="rgb(192, 55, 68)" result="flood" />
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
              <feFlood floodColor="rgb(90, 138, 122)" result="flood" />
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
            {/* Hover-state filters — same hairline ring, no outer
                glow, floodOpacity 0.5 for a weaker preview. */}
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
                floodColor="rgb(192, 55, 68)"
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
                floodColor="rgb(90, 138, 122)"
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
          {/* Selected zones — full outline + outer glow + pulse. */}
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
          {/* Hovered zone — hairline preview, no glow, no pulse. */}
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

      {/* Hover tooltip — pill above the hovered zone. */}
      {hover && (
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: `${ZONE_TOP_Y[hover]}%`,
            left: '50%',
            transform: 'translate(-50%, calc(-100% - 4px))',
            background: 'rgba(15, 20, 25, 0.85)',
            color: 'var(--kombats-text-muted)',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 11,
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
            animation: 'kombats-zone-outline-in 150ms ease-out',
          }}
        >
          {hover.toUpperCase()}
        </div>
      )}

      {/* Left gutter, outer column — sword marker at the attack zone. */}
      {attack && (
        <SideMarker
          side="left"
          offset={-5}
          top={ZONE_CENTER_Y[attack]}
          tone="crimson"
        >
          <Sword className="w-3 h-3" />
        </SideMarker>
      )}

      {/* Left gutter, inner column — shield markers at the block zones. */}
      {blockZones?.map((z) => (
        <SideMarker
          key={`${z}-block-mark`}
          side="left"
          offset={-30}
          top={ZONE_CENTER_Y[z]}
          tone="jade"
        >
          <Shield className="w-3 h-3" />
        </SideMarker>
      ))}

      {/* Hit areas — full-width rectangles per zone y-band. No polygon
          clipping; click accuracy is good enough without it because
          the silhouette visually indicates where the body is. */}
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

  const attackSummary = (
    <SummaryBlock
      tone="crimson"
      label="Attack"
      value={attack}
      placeholder="Select zone"
      icon={<Sword className="w-3 h-3" />}
    />
  );

  const blockSummary = (
    <SummaryBlock
      tone="jade"
      label="Block"
      value={block}
      placeholder="Select zones"
      icon={<Shield className="w-3 h-3" />}
    />
  );

  return (
    <div ref={rootRef} className={className}>
      {/* Component-local keyframes. A single <style> tag at the
          component root is fine — keyframes are global in scope and
          duplicate definitions across instances are harmless. */}
      <style>{ZONE_ANIMATION_CSS}</style>

      {/* Segmented Attack / Block mode control */}
      <div className="mx-auto mb-4 flex w-fit rounded-sm border border-[var(--kombats-panel-border)] overflow-hidden">
        <ModeSegment
          active={mode === 'attack'}
          onClick={() => setMode('attack')}
          tone="crimson"
          icon={<Sword className="w-3 h-3" />}
          label="Attack"
        />
        <div className="w-px bg-[var(--kombats-panel-border)]" />
        <ModeSegment
          active={mode === 'block'}
          onClick={() => setMode('block')}
          tone="jade"
          icon={<Shield className="w-3 h-3" />}
          label="Block"
        />
      </div>

      {isSplit ? (
        // ---- SPLIT: silhouette left, actions right ----
        <div className="flex items-stretch gap-4">
          <div
            className="flex items-center justify-center"
            style={{ flex: '45 1 0', minWidth: 0 }}
          >
            <div
              className="relative select-none"
              style={{
                width,
                height,
                transform: 'translateX(24px)',
              }}
            >
              {silhouetteBase}
              <NinjaSmokeOverlay intensity={0.55} />
              {silhouetteOverlays}
            </div>
          </div>

          <div
            className="flex flex-col justify-center gap-4"
            style={{ flex: '55 1 0', minWidth: 0 }}
          >
            {attackSummary}
            {blockSummary}
            {action && (
              <div className="mt-1 w-full [&>*]:w-full">{action}</div>
            )}
          </div>
        </div>
      ) : (
        // ---- STACKED: original centered layout ----
        <>
          <div
            className="relative mx-auto select-none"
            style={{ width, height }}
          >
            {silhouetteBase}
            <NinjaSmokeOverlay intensity={0.55} />
            {silhouetteOverlays}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {attackSummary}
            {blockSummary}
          </div>

          {action && (
            <div className="mt-4 w-full [&>*]:w-full flex justify-center">
              {action}
            </div>
          )}
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

interface SideMarkerProps {
  side: 'left' | 'right';
  top: number;
  tone: 'crimson' | 'jade';
  /** px offset past the silhouette edge along `side`. 0 = at edge. */
  offset?: number;
  children: React.ReactNode;
}

function SideMarker({ side, top, tone, offset = 0, children }: SideMarkerProps) {
  const color =
    tone === 'crimson'
      ? 'var(--kombats-crimson-light)'
      : 'var(--kombats-jade-light)';
  const glow =
    tone === 'crimson' ? 'rgba(208,70,84,0.45)' : 'rgba(106,154,138,0.45)';
  return (
    <div
      aria-hidden
      className="absolute pointer-events-none flex items-center"
      style={{
        top: `${top}%`,
        [side === 'left' ? 'right' : 'left']: `calc(100% + ${offset}px)`,
        transform: 'translateY(-50%)',
        color,
        filter: `drop-shadow(0 0 4px ${glow})`,
      }}
    >
      {children}
    </div>
  );
}

interface ModeSegmentProps {
  active: boolean;
  onClick: () => void;
  tone: 'crimson' | 'jade';
  icon: React.ReactNode;
  label: string;
}

function ModeSegment({ active, onClick, tone, icon, label }: ModeSegmentProps) {
  const color =
    tone === 'crimson' ? 'var(--kombats-crimson)' : 'var(--kombats-jade)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-all duration-150 flex items-center gap-2"
      style={{
        background: active ? `${color}18` : 'transparent',
        color: active ? color : 'var(--kombats-text-muted)',
        boxShadow: active ? `inset 0 0 14px ${color}22` : 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

interface SummaryBlockProps {
  tone: 'crimson' | 'jade';
  label: string;
  value: string | null;
  placeholder: string;
  icon: React.ReactNode;
}

function SummaryBlock({
  tone,
  label,
  value,
  placeholder,
  icon,
}: SummaryBlockProps) {
  const color =
    tone === 'crimson' ? 'var(--kombats-crimson)' : 'var(--kombats-jade)';
  const valueColor =
    tone === 'crimson'
      ? 'var(--kombats-crimson-light)'
      : 'var(--kombats-jade-light)';
  return (
    <div
      className="px-3 py-2 border-l-2"
      style={{
        borderLeftColor: value ? color : 'var(--kombats-panel-border)',
        background: value ? `${color}0a` : 'transparent',
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em]"
        style={{ color }}
      >
        {value && (
          <span aria-hidden className="shrink-0">
            {icon}
          </span>
        )}
        <span>{label}</span>
      </div>
      <div
        className="mt-1 text-sm tracking-wide truncate"
        style={{
          color: value ? valueColor : 'var(--kombats-text-muted)',
          fontStyle: value ? 'normal' : 'italic',
          opacity: value ? 1 : 0.75,
        }}
      >
        {value ?? placeholder}
      </div>
    </div>
  );
}
