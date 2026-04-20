import type { HTMLAttributes, ReactNode } from 'react';
import { accent, semantic, text, typography } from '../tokens';
import type { LabelTone } from '../tokens';

export interface LabelProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: LabelTone;
  children?: ReactNode;
}

const TONE_COLOR: Record<LabelTone, string> = {
  neutral: text.muted,
  attack:  semantic.attack.text,
  block:   semantic.block.text,
  accent:  accent.text,
};

export function Label({ tone = 'neutral', style, children, ...rest }: LabelProps) {
  return (
    <span
      {...rest}
      style={{
        fontSize: typography.label.fontSize,
        letterSpacing: typography.label.letterSpacing,
        textTransform: typography.label.textTransform,
        fontWeight: typography.label.fontWeight,
        color: TONE_COLOR[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
