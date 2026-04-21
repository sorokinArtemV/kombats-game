import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { surface, border as borderTokens, radius, blur, shadow } from '../tokens';
import type { SurfaceVariant, RadiusSize, ShadowLevel } from '../tokens';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  variant?: SurfaceVariant;
  radius?: RadiusSize;
  bordered?: boolean;
  /** Elevation via box-shadow. 'panel' = default glass lift, 'panelLift' = modal depth, 'none' = flush. */
  elevation?: ShadowLevel;
  children?: ReactNode;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  {
    variant = 'glass',
    radius: r = 'md',
    bordered = true,
    elevation = 'panel',
    style,
    children,
    ...rest
  },
  ref,
) {
  const useBlur = variant !== 'solidAccent';
  return (
    <div
      ref={ref}
      {...rest}
      style={{
        background: surface[variant],
        backdropFilter: useBlur ? blur.panel : undefined,
        WebkitBackdropFilter: useBlur ? blur.panel : undefined,
        border: bordered ? borderTokens.subtle : 'none',
        borderRadius: radius[r],
        boxShadow: shadow[elevation],
        ...style,
      }}
    >
      {children}
    </div>
  );
});
