import type { CSSProperties } from 'react';
import mitsudamoeSrc from '../../assets/icons/mitsudamoe.png';
import { Button, Panel } from '../../design-system/primitives';
import { accent, space, text, typography } from '../../design-system/tokens';

interface NotFoundPageProps {
  onReturnToLobby: () => void;
}

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space.lg,
};

const CARD_INNER_STYLE: CSSProperties = {
  padding: '48px 32px',
  textAlign: 'center',
  maxWidth: 360,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const ICON_STYLE: CSSProperties = {
  width: 100,
  height: 100,
  opacity: 0.35,
  marginBottom: space.lg,
  pointerEvents: 'none',
};

const ERROR_CODE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 64,
  fontWeight: 700,
  letterSpacing: '0.16em',
  color: accent.primary,
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textShadow: '0 2px 16px rgba(201, 162, 90, 0.25)',
  lineHeight: 1,
};

const SUBTITLE_STYLE: CSSProperties = {
  ...typography.labelDisplay,
  color: text.muted,
  marginTop: space.sm,
  marginBottom: space.lg,
};

export function NotFoundPage({ onReturnToLobby }: NotFoundPageProps) {
  return (
    <div style={PAGE_STYLE}>
      <Panel variant="glass" radius="lg" elevation="panelLift" bordered>
        <div style={CARD_INNER_STYLE}>
          <img src={mitsudamoeSrc} alt="" aria-hidden style={ICON_STYLE} />
          <h1 style={ERROR_CODE_STYLE}>404</h1>
          <p style={SUBTITLE_STYLE}>PATH NOT FOUND</p>
          <Button variant="primary" size="md" onClick={onReturnToLobby}>
            Return to Lobby
          </Button>
        </div>
      </Panel>
    </div>
  );
}
