import type { CSSProperties, ElementType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Panel } from '../primitives';
import { border as borderTokens, radius, space } from '../tokens';

export type AttributeColor = 'crimson' | 'gold' | 'jade' | 'silver';

export interface FighterAttribute {
  icon: ElementType;
  color: AttributeColor;
  label: string;
  value: number;
}

export interface FighterRecord {
  wins: number;
  losses: number;
  winrate?: string;
  streak?: string;
}

export interface FighterStatsPopoverProps {
  open: boolean;
  /** Header left caption — defaults to "Fighter Profile". */
  profileTitle?: string;
  /** Header right caption, rendered in gold. */
  rank?: string;
  /** Opponent-side flip: reverses header row and attribute row direction. */
  mirror?: boolean;
  attributes?: FighterAttribute[];
  record?: FighterRecord;
}

// Bespoke tint preserved — domain-specific fighter stats palette.
// These are the legacy `--kombats-*` hues used throughout the battle HUD
// (stat icons, KPI tile tints, winrate/streak accents). Kept as literal
// CSS vars rather than mapped to DS tokens because the silver hue has no
// DS equivalent and the crimson/jade/gold hues are byte-different from
// the DS semantic palette. Matches the ChatDock SOFT_HAIRLINE_COLOR pattern.
const ATTRIBUTE_COLOR: Record<AttributeColor, string> = {
  crimson: 'var(--kombats-crimson)',
  gold:    'var(--kombats-gold)',
  jade:    'var(--kombats-jade)',
  silver:  'var(--kombats-moon-silver)',
};

export function FighterStatsPopover({
  open,
  profileTitle = 'Fighter Profile',
  rank,
  mirror = false,
  attributes,
  record,
}: FighterStatsPopoverProps) {
  const hasContent = attributes != null || record != null;
  const bothSections = attributes != null && record != null;

  return (
    <AnimatePresence>
      {open && hasContent && (
        <motion.div
          key="fighter-stats"
          className="absolute left-0 right-0 bottom-full mb-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          <Panel
            variant="glass"
            radius="md"
            elevation="panel"
            bordered
            style={{ overflow: 'hidden' }}
          >
            <PopoverHeader
              profileTitle={profileTitle}
              rank={rank}
              mirror={mirror}
            />
            <PopoverBody
              attributes={attributes}
              record={record}
              mirror={mirror}
              bothSections={bothSections}
            />
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Header caption typography is a documented deviation from the DS label scale:
// 10px / 0.22em here vs. typography.label (11px / 0.18em). The tighter, more
// restrained caption reads as a secondary header inside the popover, not a
// top-level panel header.
function PopoverHeader({
  profileTitle,
  rank,
  mirror,
}: {
  profileTitle: string;
  rank?: string;
  mirror: boolean;
}) {
  const rowStyle: CSSProperties = {
    padding: `${space.sm} ${space.md}`,
    borderBottom: borderTokens.divider,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: mirror ? 'row-reverse' : 'row',
  };

  const baseCaption: CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.22em',
  };

  return (
    <div style={rowStyle}>
      <span style={{ ...baseCaption, color: 'var(--kombats-text-muted)' }}>
        {profileTitle}
      </span>
      {rank != null && (
        <span style={{ ...baseCaption, color: 'var(--kombats-gold)' }}>
          {rank}
        </span>
      )}
    </div>
  );
}

// Body padding: px-4 py-3 (16/12). The 12px vertical is a one-off literal
// deviation from the token scale (space.sm=8, space.md=16) — matches the
// existing popover density without adding a 12px token just for this surface.
function PopoverBody({
  attributes,
  record,
  mirror,
  bothSections,
}: {
  attributes?: FighterAttribute[];
  record?: FighterRecord;
  mirror: boolean;
  bothSections: boolean;
}) {
  const bodyStyle: CSSProperties = {
    padding: `12px ${space.md}`,
    display: 'grid',
    gridTemplateColumns: bothSections ? '1fr 1fr' : '1fr',
    columnGap: space.lg,
  };

  return (
    <div style={bodyStyle}>
      {attributes != null && (
        <AttributesSection attributes={attributes} mirror={mirror} />
      )}
      {record != null && <RecordSection record={record} />}
    </div>
  );
}

function AttributesSection({
  attributes,
  mirror,
}: {
  attributes: FighterAttribute[];
  mirror: boolean;
}) {
  const captionStyle: CSSProperties = {
    fontSize: 9,
    color: 'var(--kombats-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: space.sm,
    textAlign: mirror ? 'right' : 'left',
  };

  const listStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6, // space-y-1.5 = 6px; no DS token for 6px, literal with intent.
  };

  return (
    <div>
      <div style={captionStyle}>Attributes</div>
      <div style={listStyle}>
        {attributes.map((a) => (
          <AttributeRow key={a.label} attr={a} mirror={mirror} />
        ))}
      </div>
    </div>
  );
}

function AttributeRow({
  attr,
  mirror,
}: {
  attr: FighterAttribute;
  mirror: boolean;
}) {
  const Icon = attr.icon;
  const iconColor = ATTRIBUTE_COLOR[attr.color];

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: mirror ? 'row-reverse' : 'row',
  };

  const leftStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    flexDirection: mirror ? 'row-reverse' : 'row',
  };

  return (
    <div style={rowStyle}>
      <div style={leftStyle}>
        <Icon style={{ width: 14, height: 14, color: iconColor }} />
        <span style={{ fontSize: 12, color: 'var(--kombats-text-secondary)' }}>
          {attr.label}
        </span>
      </div>
      <span
        style={{
          fontSize: 12,
          color: 'var(--kombats-text-primary)',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {attr.value}
      </span>
    </div>
  );
}

function RecordSection({ record }: { record: FighterRecord }) {
  const captionStyle: CSSProperties = {
    fontSize: 9,
    color: 'var(--kombats-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: space.sm,
  };

  const tilesStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: space.sm,
  };

  const auxListStyle: CSSProperties = {
    marginTop: space.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  };

  return (
    <div>
      <div style={captionStyle}>Record</div>
      <div style={tilesStyle}>
        <KpiTile value={record.wins} label="Wins" tone="jade" />
        <KpiTile value={record.losses} label="Losses" tone="crimson" />
      </div>
      <div style={auxListStyle}>
        {record.winrate != null && (
          <AuxRow
            label="Winrate"
            value={record.winrate}
            valueColor="var(--kombats-gold)"
          />
        )}
        {record.streak != null && (
          <AuxRow
            label="Streak"
            value={record.streak}
            valueColor="var(--kombats-jade)"
          />
        )}
      </div>
    </div>
  );
}

// Bespoke tint preserved — domain-specific fighter stats palette.
// KPI tiles use the legacy jade/crimson `--kombats-*` vars with @10% alpha
// background and @30% alpha border. color-mix() replicates Tailwind's
// `bg-[var(--kombats-*)]/10` slash-opacity behavior exactly.
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
    tone === 'jade' ? 'var(--kombats-jade)' : 'var(--kombats-crimson)';

  const tileStyle: CSSProperties = {
    textAlign: 'center',
    padding: '6px 0',
    background: `color-mix(in srgb, ${toneVar} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${toneVar} 30%, transparent)`,
    borderRadius: radius.sm,
  };

  return (
    <div style={tileStyle}>
      <div
        style={{
          fontSize: 18,
          color: toneVar,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'var(--kombats-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: 4,
        }}
      >
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
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      <span style={{ color: 'var(--kombats-text-muted)' }}>{label}</span>
      <span
        style={{ color: valueColor, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}
