import { useEffect, useRef, useState } from 'react';
import { Sword, Shield } from 'lucide-react';
import silhouetteSrc from '../../assets/silhouette.png';
import { NinjaSmokeOverlay } from './NinjaSmokeOverlay.jsx';

// ---------- Layout modes ----------
//
// Two presentations of the selector, identical silhouette stack in
// both — only the summary+action placement differs.
//
// Silhouette stack (inside the 190×height wrapper, bottom → top):
//   1. Soft backdrop
//   2. Base silhouette
//   3. NinjaSmokeOverlay
//   4. Per-zone fills
//   5. Separator hairlines
//   6. Side markers           (outside wrapper, 2px from silhouette edge)
//   7. Hit areas              (transparent buttons, topmost)
//
//   STACKED  (default <520px, or layout="stacked")
//     Segmented toggle (centered)
//     Silhouette wrapper (centered)
//     Summary grid: [Attack | Block]
//     action slot (optional, centered row below)
//
//   SPLIT  (≥520px with layout="auto", or layout="split")
//     Segmented toggle (centered)
//     Two-column flex row:
//       Left column  (width + 32 px, just fits the silhouette with
//                     tight side-marker gutters)
//       Right column (flex 1) — Attack summary / Block summary / action

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

// Clicking a zone in block mode anchors the pair at that zone (downward neighbor).
// Legs wraps back to Head to match the existing game contract.
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

// Y-band boundaries (% of container height) tuned to the silhouette anatomy.
// Head = head only (no shoulders). Chest = shoulders + pecs.
// Stomach = abdomen. Waist = hip / pelvis / belt. Legs = full leg region.
const ZONE_BANDS: Record<BodyZone, { top: number; bottom: number }> = {
  Head: { top: 6, bottom: 22 },
  Chest: { top: 22, bottom: 38 },
  Stomach: { top: 38, bottom: 48 },
  Waist: { top: 48, bottom: 60 },
  Legs: { top: 60, bottom: 96 },
};

// Hit areas extend past the art so the edge bands stay easy to click.
const HIT_BANDS: Record<BodyZone, { top: number; bottom: number }> = {
  Head: { top: 0, bottom: 22 },
  Chest: { top: 22, bottom: 38 },
  Stomach: { top: 38, bottom: 48 },
  Waist: { top: 48, bottom: 60 },
  Legs: { top: 60, bottom: 100 },
};

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

  // Only the current mode drives body overlays.
  const isZoneActive = (z: BodyZone) =>
    mode === 'attack' ? attack === z : blockZones?.includes(z) ?? false;

  const handleClick = (z: BodyZone) => {
    if (mode === 'attack') onAttackChange(z);
    else onBlockChange(ZONE_TO_BLOCK_PAIR[z]);
  };

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

      {/* Base silhouette — dark fill */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          WebkitMaskImage: `url(${silhouetteSrc})`,
          maskImage: `url(${silhouetteSrc})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          background:
            'linear-gradient(180deg, #1d1f25 0%, #14161b 55%, #0f1115 100%)',
          filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.6))',
        }}
      />
    </>
  );

  // Upper silhouette layers — painted above the smoke overlay so
  // active zone highlights, separator hairlines, side markers, and
  // (crucially) the invisible hit-area buttons stay on top.
  const silhouetteOverlays = (
    <>
      {/* Per-zone fill — only the active mode's selection/hover is shown */}
      {BODY_ZONES.map((z) => {
        const active = isZoneActive(z);
        const isHover = hover === z;
        const band = ZONE_BANDS[z];

        let bg: string | null = null;
        if (mode === 'attack') {
          if (active) {
            bg =
              'linear-gradient(180deg, rgba(208,70,84,0.95) 0%, rgba(160,40,53,0.95) 100%)';
          } else if (isHover) {
            bg = 'rgba(192,55,68,0.5)';
          }
        } else {
          if (active) {
            bg =
              'linear-gradient(180deg, rgba(106,154,138,0.75) 0%, rgba(74,122,106,0.75) 100%)';
          } else if (isHover) {
            bg = 'rgba(106,154,138,0.4)';
          }
        }

        if (!bg) return null;

        const maskImage = `url(${silhouetteSrc}), linear-gradient(to bottom, transparent 0%, transparent ${band.top}%, #000 ${band.top}%, #000 ${band.bottom}%, transparent ${band.bottom}%, transparent 100%)`;

        return (
          <div
            key={`${z}-fill`}
            aria-hidden
            className="absolute inset-0 pointer-events-none transition-opacity duration-150"
            style={{
              background: bg,
              WebkitMaskImage: maskImage,
              maskImage,
              WebkitMaskSize: '100% 100%, 100% 100%',
              maskSize: '100% 100%, 100% 100%',
              WebkitMaskRepeat: 'no-repeat, no-repeat',
              maskRepeat: 'no-repeat, no-repeat',
              WebkitMaskPosition: 'center, center',
              maskPosition: 'center, center',
              WebkitMaskComposite: 'source-in',
              maskComposite: 'intersect',
            }}
          />
        );
      })}

      {/* Subtle separator hairlines between bands */}
      {BODY_ZONES.slice(0, -1).map((z) => {
        const y = ZONE_BANDS[z].bottom;
        return (
          <div
            key={`sep-${z}`}
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              left: '10%',
              right: '10%',
              top: `${y}%`,
              height: 1,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(201,169,97,0.22) 50%, transparent 100%)',
            }}
          />
        );
      })}

      {/* Left gutter, outer column — sword marker at the attack zone.
          Offset 22 leaves a clear gap between the sword and the shield
          markers when both render at the same Y band. */}
      {attack && (
        <SideMarker
          side="left"
          offset={-5}
          top={(ZONE_BANDS[attack].top + ZONE_BANDS[attack].bottom) / 2}
          tone="crimson"
        >
          <Sword className="w-3 h-3" />
        </SideMarker>
      )}

      {/* Left gutter, inner column — shield markers at the block zones.
          Offset 0 places them flush against the silhouette edge, on a
          different axis from the swords so the two kinds never collide. */}
      {blockZones?.map((z) => (
        <SideMarker
          key={`${z}-block-mark`}
          side="left"
          offset={-30}
          top={(ZONE_BANDS[z].top + ZONE_BANDS[z].bottom) / 2}
          tone="jade"
        >
          <Shield className="w-3 h-3" />
        </SideMarker>
      ))}

      {/* Hit areas */}
      {BODY_ZONES.map((z) => {
        const band = HIT_BANDS[z];
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
              top: `${band.top}%`,
              height: `${band.bottom - band.top}%`,
              background: 'transparent',
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
          {/* Left column — 45% of free space. All markers (sword outer
              at offset 14, shield inner at offset 0) now stack on the
              LEFT of the silhouette, so we nudge the silhouette itself
              slightly right via translateX to give the outer sword
              column room without clipping at the card's left edge. */}
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

          {/* Right column — 55% of free space. Wider share for the two
              summary blocks and the action slot (LOCK IN). */}
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

