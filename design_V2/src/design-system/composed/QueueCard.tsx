import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { Clock, Target } from 'lucide-react';
import { Panel, PanelHeader, Divider, Button, Label } from '../primitives';
import { accent, space, text } from '../tokens';

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

const PULSE_ANIMATION = {
  scale: [1, 1.15, 1],
  opacity: [0.55, 1, 0.55],
};

const PULSE_TRANSITION = {
  duration: 2,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

function PulsingTarget() {
  return (
    <motion.div
      style={{
        width: 80,
        height: 80,
        borderRadius: 9999,
        border: `2px solid ${accent.primary}`,
        position: 'relative',
      }}
      animate={PULSE_ANIMATION}
      transition={PULSE_TRANSITION}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Target style={{ width: 40, height: 40, color: accent.primary }} />
      </div>
    </motion.div>
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
              <PulsingTarget />
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
