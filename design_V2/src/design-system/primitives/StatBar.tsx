import type { CSSProperties } from 'react';
import { border as borderTokens, surface, textShadow } from '../tokens';

export interface StatBarProps {
  value: number;
  max: number;
  fillColor: string;            // solid color or CSS gradient string
  direction?: 'ltr' | 'rtl';    // 'rtl' depletes right-to-left (mirrored opponent HUD)
  skewed?: boolean;             // parallelogram clip-path silhouette
  showNumbers?: boolean;
  height?: number;              // px; defaults to 28 to match current HP bar
  className?: string;
  style?: CSSProperties;
  numberColor?: string;
}

export function StatBar({
  value,
  max,
  fillColor,
  direction = 'ltr',
  skewed = false,
  showNumbers = false,
  height = 28,
  className,
  style,
  numberColor,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const mirror = direction === 'rtl';

  const clipPath = skewed
    ? mirror
      ? 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 12px 100%)'
      : 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)'
    : undefined;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height,
        clipPath,
        background: surface.glassSubtle,
        border: borderTokens.subtle,
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: mirror ? 'auto' : 0,
          right: mirror ? 0 : 'auto',
          width: `${pct}%`,
          background: fillColor,
          transition: 'width 300ms ease-out',
        }}
      />
      {showNumbers && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: mirror ? 'flex-start' : 'flex-end',
            padding: '0 14px',
            pointerEvents: 'none',
            color: numberColor,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            textShadow: textShadow.onGlassStrong,
          }}
        >
          {value}
          <span style={{ opacity: 0.55, margin: '0 3px' }}>/</span>
          {max}
        </div>
      )}
    </div>
  );
}
