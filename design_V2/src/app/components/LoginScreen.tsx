import type { CSSProperties } from 'react';
import { Button, Panel } from '../../design-system/primitives';
import {
  accent,
  space,
  text,
  typography,
} from '../../design-system/tokens';

interface LoginScreenProps {
  onLogin: () => void;
  onSignUp: () => void;
}

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space.lg,
  position: 'relative',
};

const AMBIENT_GLOW_STYLE: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: 480,
  height: 480,
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background:
    'radial-gradient(circle, rgba(201, 162, 90, 0.08) 0%, rgba(201, 162, 90, 0.03) 40%, transparent 70%)',
  pointerEvents: 'none',
};

const CONTENT_STYLE: CSSProperties = {
  padding: '48px 40px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 320,
  maxWidth: 380,
};

// Diamond-glyph logo — mirrors TopNavBar's bespoke inline logo at a larger
// scale. The rotated square frame + centered 拳 ideogram is the brand mark;
// no external image asset exists. Sized ~60px so it anchors the panel
// without competing with the Cinzel wordmark below it.
const LOGO_FRAME_PX = 60;
const LOGO_GLYPH_PX = 30;

const LOGO_FRAME_STYLE: CSSProperties = {
  position: 'relative',
  width: LOGO_FRAME_PX,
  height: LOGO_FRAME_PX,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transform: 'rotate(45deg)',
  border: '1px solid rgba(201, 162, 90, 0.55)',
  background: 'rgba(201, 162, 90, 0.05)',
  boxShadow:
    'inset 0 0 0 1px rgba(201, 162, 90, 0.08), 0 0 20px rgba(201, 162, 90, 0.22)',
  marginBottom: space.lg,
};

const LOGO_GLYPH_STYLE: CSSProperties = {
  transform: 'rotate(-45deg)',
  color: accent.primary,
  fontSize: LOGO_GLYPH_PX,
  lineHeight: 1,
  fontFamily:
    '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif',
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: accent.primary,
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textShadow: '0 2px 16px rgba(201, 162, 90, 0.25)',
  lineHeight: 1,
};

const TAGLINE_STYLE: CSSProperties = {
  ...typography.labelDisplay,
  color: text.muted,
  marginTop: space.sm,
  marginBottom: space.xl,
};

const BUTTONS_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space.sm,
  width: '100%',
};

const BUTTON_FULL_WIDTH_STYLE: CSSProperties = {
  width: '100%',
};

export function LoginScreen({ onLogin, onSignUp }: LoginScreenProps) {
  return (
    <div style={PAGE_STYLE}>
      <div aria-hidden style={AMBIENT_GLOW_STYLE} />

      <Panel variant="glass" radius="lg" elevation="panelLift" bordered>
        <div style={CONTENT_STYLE}>
          <div aria-hidden style={LOGO_FRAME_STYLE}>
            <span style={LOGO_GLYPH_STYLE}>拳</span>
          </div>

          <h1 style={TITLE_STYLE}>The Kombats</h1>
          <p style={TAGLINE_STYLE}>Enter the Arena</p>

          <div style={BUTTONS_STYLE}>
            <Button
              variant="primary"
              size="lg"
              onClick={onLogin}
              style={BUTTON_FULL_WIDTH_STYLE}
            >
              Log In
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={onSignUp}
              style={BUTTON_FULL_WIDTH_STYLE}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
