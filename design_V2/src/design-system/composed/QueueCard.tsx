import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { Clock } from 'lucide-react';
import { Panel, PanelHeader, Divider, Button, Label } from '../primitives';
import { accent, space, text } from '../tokens';
import mitsudamoeSrc from '../../assets/icons/mitsudamoe.png';

export type QueueStatus = 'ready' | 'searching';

export interface QueueCardProps {
  status: QueueStatus;
  title: string;
  battleType?: string;
  searchingLabel?: string;
  searchingValue?: string;
  elapsedSeconds?: number;
  onJoinQueue?: () => void;
  onCancel?: () => void;
}

// Matchmaking-search spinner. Mirrors the combat-waiting centerpiece in
// BodyZoneSelector (mitsudomoe icon + counter-rotating ring + radial glow),
// scaled down for this compact queue panel: 200px glow, 140px ring, 88px
// icon. Keeps the game's waiting-state visual language consistent.
function MitsudomoeSpinner() {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 200,
        height: 200,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(201,162,90,0.18) 0%, rgba(201,162,90,0.08) 35%, rgba(201,162,90,0.03) 60%, transparent 80%)',
          pointerEvents: 'none',
        }}
      />
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          width: 140,
          height: 140,
          borderRadius: '50%',
          border: '1px solid rgba(201, 162, 90, 0.15)',
          pointerEvents: 'none',
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />
      <motion.img
        src={mitsudamoeSrc}
        alt=""
        aria-hidden
        style={{ width: 88, height: 88, opacity: 0.5 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

function ElapsedTimer({ seconds }: { seconds: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        color: text.secondary,
      }}
    >
      <Clock style={{ width: 14, height: 14 }} />
      <span style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
        {seconds}s
      </span>
    </div>
  );
}

export function QueueCard({
  status,
  title,
  battleType,
  searchingLabel,
  searchingValue,
  elapsedSeconds = 0,
  onJoinQueue,
  onCancel,
}: QueueCardProps) {
  const isSearching = status === 'searching';

  const contentStyle: CSSProperties = {
    padding: space.lg,
  };

  const headerStyle: CSSProperties = {
    padding: 0,
    textAlign: 'center',
    marginBottom: space.md,
  };

  const centerRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
  };

  const footerValueStyle: CSSProperties = {
    display: 'block',
    marginTop: space.xs,
    fontSize: 16,
    fontWeight: 500,
    color: accent.text,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const footerLabel = isSearching ? searchingLabel : 'Battle Type';
  const footerValue = isSearching ? searchingValue : battleType;

  return (
    <Panel variant="glass" radius="md" elevation="panel" bordered>
      <div style={contentStyle}>
        <PanelHeader accent={isSearching} style={headerStyle}>
          {title}
        </PanelHeader>

        {isSearching && (
          <>
            <div style={{ ...centerRowStyle, marginBottom: space.md }}>
              <MitsudomoeSpinner />
            </div>
            <div style={{ marginBottom: space.md }}>
              <ElapsedTimer seconds={elapsedSeconds} />
            </div>
          </>
        )}

        <div style={centerRowStyle}>
          {isSearching ? (
            <Button variant="secondary" size="lg" onClick={onCancel}>
              Cancel Search
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={onJoinQueue}>
              Join Queue
            </Button>
          )}
        </div>

        <Divider marginY="md" />

        <div style={{ textAlign: 'center' }}>
          <Label tone="neutral">{footerLabel}</Label>
          <span style={footerValueStyle}>{footerValue}</span>
        </div>
      </div>
    </Panel>
  );
}
