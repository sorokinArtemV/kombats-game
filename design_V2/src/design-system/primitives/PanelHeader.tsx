import type { HTMLAttributes, ReactNode } from 'react';
import { accent, text, typography, space } from '../tokens';

export interface PanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  accent?: boolean;
  children?: ReactNode;
}

export function PanelHeader({
  accent: isAccent = false,
  style,
  children,
  ...rest
}: PanelHeaderProps) {
  return (
    <div
      {...rest}
      style={{
        padding: `${space.sm} ${space.md}`,
        fontSize: typography.label.fontSize,
        letterSpacing: typography.label.letterSpacing,
        textTransform: typography.label.textTransform,
        fontWeight: typography.label.fontWeight,
        color: isAccent ? accent.text : text.muted,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
