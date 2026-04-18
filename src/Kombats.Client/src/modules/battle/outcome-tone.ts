import type { BattleEndOutcome } from './battle-end-outcome';

// Shared visual tokens for battle-end outcomes. Both the
// `BattleResultScreen` (full post-match layout) and the `BattleEndOverlay`
// (mid-battle celebration dialog) project the same outcome into the same
// accent color / container chrome, so the record lives here rather than
// duplicated in each component.
//
// Visual values are CSS-variable tokens — hex/rgb are never introduced
// here. `--shadow-{status}` tokens live in `ui/theme/tokens.css`.

export interface OutcomeToneTokens {
  /** Text color for the outcome title. */
  accentClass: string;
  /** Solid fill for the icon disc. */
  iconBg: string;
  /** Glow around the icon disc. */
  iconShadow: string;
  /** Surface color for the outer container (tinted by outcome). */
  containerBg: string;
  /** Border for the outer container (tinted by outcome). */
  border: string;
  /** Primary action button variant classes. */
  primaryButton: string;
  /** Secondary action button variant classes. */
  secondaryButton: string;
}

export const OUTCOME_TONE: Record<BattleEndOutcome, OutcomeToneTokens> = {
  victory: {
    accentClass: 'text-success',
    iconBg: 'bg-success',
    iconShadow: 'shadow-[var(--shadow-success)]',
    containerBg: 'bg-success/10',
    border: 'border-success',
    primaryButton: 'bg-success hover:bg-go-hover',
    secondaryButton: 'border-success text-success hover:bg-success/10',
  },
  defeat: {
    accentClass: 'text-error',
    iconBg: 'bg-error',
    iconShadow: 'shadow-[var(--shadow-error)]',
    containerBg: 'bg-error/10',
    border: 'border-error',
    primaryButton: 'bg-bg-surface hover:bg-border-strong',
    secondaryButton: 'border-error text-error hover:bg-error/10',
  },
  draw: {
    accentClass: 'text-info',
    iconBg: 'bg-info',
    iconShadow: 'shadow-[var(--shadow-info)]',
    containerBg: 'bg-bg-secondary',
    border: 'border-info',
    primaryButton: 'bg-info hover:bg-block-strong',
    secondaryButton: 'border-info text-info hover:bg-info/10',
  },
  error: {
    accentClass: 'text-warning',
    iconBg: 'bg-warning',
    iconShadow: 'shadow-[var(--shadow-warning)]',
    containerBg: 'bg-bg-secondary',
    border: 'border-warning',
    primaryButton: 'bg-warning hover:opacity-90',
    secondaryButton: 'border-warning text-warning hover:bg-warning/10',
  },
  other: {
    accentClass: 'text-text-secondary',
    iconBg: 'bg-bg-surface',
    iconShadow: 'shadow-none',
    containerBg: 'bg-bg-secondary',
    border: 'border-border',
    primaryButton: 'bg-accent hover:bg-accent-hover',
    secondaryButton: 'border-border-strong text-text-secondary hover:bg-bg-surface',
  },
};

export function outcomeAccentClass(outcome: BattleEndOutcome): string {
  return OUTCOME_TONE[outcome].accentClass;
}
