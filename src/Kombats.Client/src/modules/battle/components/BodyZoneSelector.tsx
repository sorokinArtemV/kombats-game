import { useState } from 'react';
import { clsx } from 'clsx';
import { motion, useReducedMotion } from 'motion/react';
import { useBattlePhase, useBattleActions, useBattleConnectionState } from '../hooks';
import { ALL_ZONES, VALID_BLOCK_PAIRS, isValidBlockPair } from '../zones';
import silhouetteSrc from '@/ui/assets/fighters/silhouette.png';
import mitsudamoeSrc from '@/ui/assets/icons/mitsudamoe.png';
import type { BattleZone } from '@/types/battle';

// ---------------------------------------------------------------------------
// Vertical zone bands (percent of stage height, top → bottom)
// Chosen so each band covers the expected anatomical region of the neutral
// silhouette PNG. Feathering handled by the gradient stops below.
// ---------------------------------------------------------------------------
const ZONE_BAND: Record<BattleZone, { start: number; end: number }> = {
  Head: { start: 0, end: 16 },
  Chest: { start: 16, end: 36 },
  Belly: { start: 36, end: 54 },
  Waist: { start: 54, end: 68 },
  Legs: { start: 68, end: 100 },
};

// Feather width around each band, in percent. Kept small so bands do not
// visually bleed into each other but large enough to avoid a hard edge.
const FEATHER = 3;

function bandGradient(zone: BattleZone): string {
  const { start, end } = ZONE_BAND[zone];
  // Soft edges at start/end unless we're pinned to 0% or 100%.
  const top = Math.max(0, start - FEATHER);
  const bottom = Math.min(100, end + FEATHER);
  return [
    `linear-gradient(to bottom,`,
    start <= 0
      ? `black 0%,`
      : `transparent ${top}%, black ${start}%,`,
    `black ${end}%,`,
    end >= 100
      ? `black 100%)`
      : `transparent ${bottom}%)`,
  ].join(' ');
}

function pairGradient(a: BattleZone, b: BattleZone): string {
  const aBand = ZONE_BAND[a];
  const bBand = ZONE_BAND[b];
  const start = Math.min(aBand.start, bBand.start);
  const end = Math.max(aBand.end, bBand.end);
  const top = Math.max(0, start - FEATHER);
  const bottom = Math.min(100, end + FEATHER);
  return [
    `linear-gradient(to bottom,`,
    start <= 0
      ? `black 0%,`
      : `transparent ${top}%, black ${start}%,`,
    `black ${end}%,`,
    end >= 100
      ? `black 100%)`
      : `transparent ${bottom}%)`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Shared mask styles — silhouette PNG + zone gradient, composited to intersect.
// DESIGN_REFERENCE.md §3.13.
// ---------------------------------------------------------------------------
function twoLayerMask(zoneGradient: string): React.CSSProperties {
  return {
    WebkitMaskImage: `url(${silhouetteSrc}), ${zoneGradient}`,
    maskImage: `url(${silhouetteSrc}), ${zoneGradient}`,
    WebkitMaskSize: '100% 100%, 100% 100%',
    maskSize: '100% 100%, 100% 100%',
    WebkitMaskRepeat: 'no-repeat, no-repeat',
    maskRepeat: 'no-repeat, no-repeat',
    WebkitMaskPosition: 'center, center',
    maskPosition: 'center, center',
    // `intersect` in standards; `source-in` in WebKit.
    WebkitMaskComposite: 'source-in',
    maskComposite: 'intersect',
  };
}

const silhouetteOnlyMask: React.CSSProperties = {
  WebkitMaskImage: `url(${silhouetteSrc})`,
  maskImage: `url(${silhouetteSrc})`,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
};

const silhouetteBaseStyle: React.CSSProperties = {
  ...silhouetteOnlyMask,
  background: 'rgb(10, 14, 22)',
  filter:
    'drop-shadow(0 0 2px rgba(201, 162, 90, 0.15)) drop-shadow(0 10px 24px rgba(0,0,0,0.6))',
};

const warmBackdropStyle: React.CSSProperties = {
  inset: '-8% -14%',
  background:
    'radial-gradient(58% 55% at 50% 55%, rgba(201,169,97,0.05) 0%, rgba(15,20,25,0) 70%)',
};

const tacticalGridStyle: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, rgba(201,162,90,0.12) 1px, transparent 1.5px)',
  backgroundSize: '12px 12px',
  WebkitMaskImage:
    'radial-gradient(ellipse at center, black 50%, transparent 90%)',
  maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
};

// DESIGN_REFERENCE.md §3.13 — selected radial fill + hover flat fill.
function selectedFillBackground(rgb: string): string {
  return `radial-gradient(ellipse at center, rgba(${rgb}, 0.7) 0%, rgba(${rgb}, 0.3) 60%, rgba(${rgb}, 0) 100%)`;
}
const ATTACK_RGB = '192, 55, 68';
const BLOCK_RGB = '90, 138, 122';

// Keyframes for the selected zone pulse. Injected via <style> inside the
// component so this is self-contained and does not pollute global CSS.
const PULSE_KEYFRAMES = `
@keyframes kombats-zone-pulse {
  0%, 100% { opacity: 0.8; }
  50%      { opacity: 1; }
}
@keyframes kombats-zone-outline-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BodyZoneSelector() {
  const phase = useBattlePhase();
  const connectionState = useBattleConnectionState();
  const actions = useBattleActions();
  const reduceMotion = useReducedMotion();

  // Local state for the two-click block pair flow. Held locally because the
  // store only accepts fully-formed (adjacent) pairs via `selectBlockPair`.
  const [blockPrimary, setBlockPrimary] = useState<BattleZone | null>(null);

  const turnOpen = phase === 'TurnOpen';
  const connectionBlocked = connectionState !== 'connected';
  const disabled = !turnOpen || connectionBlocked || actions.isSubmitting;
  const canGo = actions.canSubmit && !connectionBlocked;

  // Lock-in waiting state: post-Submitted/Resolving, show a centered
  // Mitsudomoe spinner instead of the silhouette diptych.
  const isWaiting = phase === 'Submitted' || phase === 'Resolving';

  const handleAttackClick = (zone: BattleZone) => {
    if (disabled) return;
    actions.selectAttackZone(zone);
  };

  const handleBlockClick = (zone: BattleZone) => {
    if (disabled) return;
    const committed = actions.selectedBlockPair;
    if (committed && committed[0] === zone) {
      // Click primary zone of committed pair → restart selection from there.
      setBlockPrimary(zone);
      return;
    }
    if (!blockPrimary) {
      setBlockPrimary(zone);
      return;
    }
    if (blockPrimary === zone) {
      // Click same zone again → deselect.
      setBlockPrimary(null);
      return;
    }
    if (isValidBlockPair(blockPrimary, zone)) {
      actions.selectBlockPair([blockPrimary, zone]);
      setBlockPrimary(null);
    } else {
      // Non-adjacent second click → treat as a fresh primary.
      setBlockPrimary(zone);
    }
  };

  const attackHover = useHoverZone();
  const blockHover = useHoverZone();

  return (
    <div className="flex flex-col gap-4">
      <style>{PULSE_KEYFRAMES}</style>

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
              headerGlow="0 2px 14px rgba(192, 55, 68, 0.35)"
              selected={
                actions.selectedAttackZone
                  ? [actions.selectedAttackZone]
                  : []
              }
              hoverZone={attackHover.hover}
              onZoneHover={attackHover.setHover}
              onZoneClick={handleAttackClick}
              selectionLabel={actions.selectedAttackZone ?? null}
              placeholder="Select zone"
              disabled={disabled}
            />
            <SilhouetteColumn
              mode="block"
              headerLabel="Block"
              headerColor="var(--color-kombats-jade-light)"
              headerGlow="0 2px 14px rgba(90, 138, 122, 0.35)"
              selected={
                actions.selectedBlockPair
                  ? [actions.selectedBlockPair[0], actions.selectedBlockPair[1]]
                  : blockPrimary
                    ? [blockPrimary]
                    : []
              }
              hoverZone={blockHover.hover}
              onZoneHover={blockHover.setHover}
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
              primaryZone={blockPrimary}
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

      {/* Accessible secondary pair list for keyboard users and as a
         visual confirmation/fallback for the silhouette picker. */}
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

function useHoverZone() {
  const [hover, setHover] = useState<BattleZone | null>(null);
  return { hover, setHover };
}

// ---------------------------------------------------------------------------
// Silhouette column — one side of the diptych.
// ---------------------------------------------------------------------------

interface SilhouetteColumnProps {
  mode: 'attack' | 'block';
  headerLabel: string;
  headerColor: string;
  headerGlow: string;
  selected: BattleZone[];
  hoverZone: BattleZone | null;
  onZoneHover: (zone: BattleZone | null) => void;
  onZoneClick: (zone: BattleZone) => void;
  selectionLabel: string | null;
  placeholder: string;
  disabled: boolean;
  primaryZone?: BattleZone | null;
}

function SilhouetteColumn({
  mode,
  headerLabel,
  headerColor,
  headerGlow,
  selected,
  hoverZone,
  onZoneHover,
  onZoneClick,
  selectionLabel,
  placeholder,
  disabled,
}: SilhouetteColumnProps) {
  const rgb = mode === 'attack' ? ATTACK_RGB : BLOCK_RGB;
  const pairZones: [BattleZone, BattleZone] | null =
    mode === 'block' && selected.length === 2
      ? [selected[0], selected[1]]
      : null;

  const cornerColor =
    mode === 'attack'
      ? 'rgba(192, 55, 68, 0.35)'
      : 'rgba(90, 138, 122, 0.35)';

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
        className="relative mx-auto aspect-[2/3] w-full max-w-[210px]"
        onMouseLeave={() => onZoneHover(null)}
      >
        {/* Soft warm radial backdrop behind silhouette. */}
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

        {/* Selected zone fills — radial-gradient, clipped to silhouette × band. */}
        {pairZones ? (
          <ZoneFill
            zoneGradient={pairGradient(pairZones[0], pairZones[1])}
            background={selectedFillBackground(rgb)}
            pulsing
          />
        ) : (
          selected.map((zone) => (
            <ZoneFill
              key={`sel-${zone}`}
              zoneGradient={bandGradient(zone)}
              background={selectedFillBackground(rgb)}
              pulsing
            />
          ))
        )}

        {/* Hover fill — flat alpha, 150ms fade. */}
        {hoverZone && !selected.includes(hoverZone) && (
          <ZoneFill
            key={`hover-${hoverZone}`}
            zoneGradient={bandGradient(hoverZone)}
            background={`rgba(${rgb}, 0.25)`}
            hover
          />
        )}

        {/* Click targets — one transparent button per zone, stacked vertically. */}
        <div className="absolute inset-0">
          {ALL_ZONES.map((zone) => {
            const band = ZONE_BAND[zone];
            const top = `${band.start}%`;
            const height = `${band.end - band.start}%`;
            const isSelected = selected.includes(zone);
            return (
              <button
                key={zone}
                type="button"
                disabled={disabled}
                onClick={() => onZoneClick(zone)}
                onMouseEnter={() => onZoneHover(zone)}
                onFocus={() => onZoneHover(zone)}
                onBlur={() => onZoneHover(null)}
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
            color: mode === 'attack'
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
            color: 'rgba(232,232,240,0.48)',
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}

interface ZoneFillProps {
  zoneGradient: string;
  background: string;
  pulsing?: boolean;
  hover?: boolean;
}

function ZoneFill({ zoneGradient, background, pulsing, hover }: ZoneFillProps) {
  const style: React.CSSProperties = {
    ...twoLayerMask(zoneGradient),
    background,
    animation: pulsing
      ? 'kombats-zone-pulse 2.5s ease-in-out infinite'
      : hover
        ? 'kombats-zone-outline-in 150ms ease-out both'
        : undefined,
  };
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none" style={style} />
  );
}

// DESIGN_REFERENCE.md §3.15 — corner ornament marks (slim variant).
function CornerMarks({ color, side }: { color: string; side: 'left' | 'right' }) {
  const common = {
    width: 14,
    height: 14,
  };
  if (side === 'left') {
    return (
      <>
        <span
          aria-hidden
          className="absolute -z-0"
          style={{
            ...common,
            top: 0,
            left: 0,
            borderTop: `1.5px solid ${color}`,
            borderLeft: `1.5px solid ${color}`,
          }}
        />
        <span
          aria-hidden
          className="absolute -z-0"
          style={{
            ...common,
            bottom: 0,
            left: 0,
            borderBottom: `1.5px solid ${color}`,
            borderLeft: `1.5px solid ${color}`,
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
          ...common,
          top: 0,
          right: 0,
          borderTop: `1.5px solid ${color}`,
          borderRight: `1.5px solid ${color}`,
        }}
      />
      <span
        aria-hidden
        className="absolute -z-0"
        style={{
          ...common,
          bottom: 0,
          right: 0,
          borderBottom: `1.5px solid ${color}`,
          borderRight: `1.5px solid ${color}`,
        }}
      />
    </>
  );
}

// DESIGN_REFERENCE.md §3.12 — Mitsudomoe spinner, sized to fit the lock-in
// waiting slot (smaller than the queue variant).
function LockedInSpinner({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div
      className="relative flex h-[200px] w-[200px] items-center justify-center"
      aria-hidden
    >
      <div
        className="pointer-events-none absolute h-[200px] w-[200px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(201, 162, 90, 0.18) 0%, rgba(201, 162, 90, 0.08) 35%, rgba(201, 162, 90, 0.03) 60%, transparent 80%)',
        }}
      />
      <motion.div
        className="pointer-events-none absolute h-[140px] w-[140px] rounded-full"
        style={{ border: '1px solid rgba(201, 162, 90, 0.15)' }}
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
        className="pointer-events-none h-[88px] w-[88px] opacity-50 mix-blend-screen"
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

