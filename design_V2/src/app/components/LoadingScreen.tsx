import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import mitsudamoeSrc from '../../assets/icons/mitsudamoe.png';
import { accent, space } from '../../design-system/tokens';

const SCREEN_STYLE: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.lg,
};

const STAGE_STYLE: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 320,
  height: 320,
};

const GLOW_STYLE: CSSProperties = {
  position: 'absolute',
  width: 320,
  height: 320,
  borderRadius: '50%',
  background:
    'radial-gradient(circle, rgba(201, 162, 90, 0.18) 0%, rgba(201, 162, 90, 0.08) 35%, rgba(201, 162, 90, 0.03) 60%, transparent 80%)',
  pointerEvents: 'none',
};

const RING_STYLE: CSSProperties = {
  position: 'absolute',
  width: 220,
  height: 220,
  borderRadius: '50%',
  border: '1px solid rgba(201, 162, 90, 0.15)',
  pointerEvents: 'none',
};

const ICON_STYLE: CSSProperties = {
  width: 140,
  height: 140,
  opacity: 0.5,
  mixBlendMode: 'screen',
  pointerEvents: 'none',
};

const LABEL_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: accent.muted,
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textAlign: 'center',
};

export function LoadingScreen() {
  return (
    <div style={SCREEN_STYLE}>
      <div style={STAGE_STYLE}>
        <div aria-hidden style={GLOW_STYLE} />
        <motion.div
          aria-hidden
          style={RING_STYLE}
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        />
        <motion.img
          src={mitsudamoeSrc}
          alt=""
          aria-hidden
          style={ICON_STYLE}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <motion.div
        role="status"
        aria-live="polite"
        style={LABEL_STYLE}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        Loading
      </motion.div>
    </div>
  );
}
