import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { accent, border as borderTokens, radius, semantic, text, typography } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

const SIZE_STYLES: Record<ButtonSize, { padding: string; fontSize: string }> = {
  sm: { padding: '6px 14px',  fontSize: '11px' },
  md: { padding: '10px 24px', fontSize: '13px' },
  lg: { padding: '16px 40px', fontSize: '15px' },
};

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: accent.primary,
    color: text.onAccent,
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: text.primary,
    border: borderTokens.emphasis,
  },
  ghost: {
    background: 'transparent',
    color: text.secondary,
    border: 'none',
  },
  danger: {
    background: semantic.danger.base,
    color: text.onDanger,
    border: 'none',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', disabled = false, style, children, ...rest },
  ref,
) {
  const base: CSSProperties = {
    ...SIZE_STYLES[size],
    borderRadius: radius.md,
    letterSpacing: typography.labelLarge.letterSpacing,
    textTransform: typography.labelLarge.textTransform,
    fontWeight: typography.labelLarge.fontWeight,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 150ms ease, border-color 150ms ease, transform 80ms ease',
    whiteSpace: 'nowrap',
  };

  return (
    <button
      ref={ref}
      disabled={disabled}
      {...rest}
      style={{ ...base, ...VARIANT_STYLES[variant], ...style }}
    >
      {children}
    </button>
  );
});
