import type { CSSProperties } from 'react';
import { border as borderTokens, space } from '../tokens';
import type { SpaceSize } from '../tokens';

export interface DividerProps {
  marginY?: SpaceSize;
  className?: string;
}

export function Divider({ marginY = 'sm', className }: DividerProps) {
  const style: CSSProperties = {
    borderTop: borderTokens.divider,
    marginTop: space[marginY],
    marginBottom: space[marginY],
    width: '100%',
  };
  return <div aria-hidden className={className} style={style} />;
}
