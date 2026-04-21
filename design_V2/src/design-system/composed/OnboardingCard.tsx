import { Children, Fragment, type CSSProperties, type ReactNode } from 'react';
import { Panel, Divider } from '../primitives';
import { accent, space, text } from '../tokens';

export interface OnboardingCardProps {
  /** Small uppercase caption above the title (e.g. "Welcome"). */
  eyebrow?: ReactNode;
  /** Display heading — rendered as bespoke Cinzel serif with gold glow. */
  title: ReactNode;
  /** Short descriptive line below the title. */
  subtitle?: ReactNode;
  /** Sections of the card body. OnboardingCard inserts a Divider between the header and each section. */
  children?: ReactNode;
}

// Title typography is intentionally inline and bespoke — it is the onboarding
// forge card's display heading, not a general-purpose label primitive.
const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '0.28em',
  textTransform: 'uppercase',
  color: accent.primary,
  lineHeight: 1,
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
};

const EYEBROW_STYLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.32em',
  textTransform: 'uppercase',
  color: text.muted,
  marginBottom: 6,
};

const SUBTITLE_STYLE: CSSProperties = {
  margin: 0,
  marginTop: space.sm,
  fontSize: 12,
  color: text.secondary,
  letterSpacing: '0.02em',
};

export function OnboardingCard({
  eyebrow,
  title,
  subtitle,
  children,
}: OnboardingCardProps) {
  const containerStyle: CSSProperties = {
    padding: space.lg,
  };

  const headerStyle: CSSProperties = {
    textAlign: 'center',
  };

  const sections = Children.toArray(children);

  return (
    <Panel variant="glass" radius="md" elevation="panel" bordered>
      <div style={containerStyle}>
        <div style={headerStyle}>
          {eyebrow != null && <div style={EYEBROW_STYLE}>{eyebrow}</div>}
          <h1 style={TITLE_STYLE}>{title}</h1>
          {subtitle != null && <p style={SUBTITLE_STYLE}>{subtitle}</p>}
        </div>

        {sections.map((child, i) => (
          <Fragment key={i}>
            <Divider marginY="md" />
            {child}
          </Fragment>
        ))}
      </div>
    </Panel>
  );
}
