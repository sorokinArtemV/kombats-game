import type { CSSProperties, ReactNode } from 'react';
import { Panel, Label } from '../primitives';
import { accent, semantic, space, text } from '../tokens';

export type RewardTone = 'neutral' | 'accent' | 'success' | 'danger';

export interface RewardRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: RewardTone;
  className?: string;
}

const TONE_COLOR: Record<RewardTone, string> = {
  neutral: text.primary,
  accent:  accent.primary,
  success: semantic.success.text,
  danger:  semantic.danger.text,
};

export function RewardRow({
  label,
  value,
  tone = 'neutral',
  className,
}: RewardRowProps) {
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${space.sm} ${space.md}`,
  };

  const valueStyle: CSSProperties = {
    fontSize: '14px',
    fontWeight: 500,
    color: TONE_COLOR[tone],
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <Panel
      variant="glassSubtle"
      radius="sm"
      elevation="none"
      bordered
      className={className}
      style={rowStyle}
    >
      <Label tone="neutral">{label}</Label>
      <span style={valueStyle}>{value}</span>
    </Panel>
  );
}
