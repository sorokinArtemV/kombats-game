// Single source of truth for the "game glass" visual language.
// Primitives in src/design-system/primitives/ consume these tokens and nothing else.
// Composed components and screens should only read from here or from primitives.

export const surface = {
  glass:        'rgba(15, 20, 28, 0.70)', // default translucent panel
  glassDense:   'rgba(15, 20, 28, 0.88)', // text-heavy / modal-style content
  glassSubtle:  'rgba(15, 20, 28, 0.55)', // HUD overlays, HP plates
  solidAccent:  'rgba(15, 20, 28, 0.96)', // rare: disconnect banners, critical notifs
} as const;

export const border = {
  subtle:   '0.5px solid rgba(255, 255, 255, 0.06)', // default panel edge
  divider:  '1px solid rgba(255, 255, 255, 0.04)',   // inner section dividers
  emphasis: '0.5px solid rgba(255, 255, 255, 0.12)', // hover / active / focus
} as const;

export const accent = {
  primary: '#c9a25a',                   // main gold
  muted:   'rgba(201, 162, 90, 0.60)',  // secondary gold
  text:    'rgba(201, 162, 90, 0.90)',  // gold for text (sender names, section headers)
} as const;

export const semantic = {
  attack:  { base: '#c03744', soft: 'rgba(192, 55, 68, 0.15)',  text: '#d04654' },
  block:   { base: '#5a8a7a', soft: 'rgba(90, 138, 122, 0.15)', text: '#6a9a8a' },
  success: { base: '#5a8a7a', soft: 'rgba(90, 138, 122, 0.15)', text: '#6a9a8a' },
  danger:  { base: '#c03744', soft: 'rgba(192, 55, 68, 0.15)',  text: '#d04654' },
} as const;

export const text = {
  primary:   '#e8e8f0',
  secondary: 'rgba(232, 232, 240, 0.75)',
  muted:     'rgba(232, 232, 240, 0.48)',
  onAccent:  '#0f1419', // dark text on gold button
  onDanger:  '#ffffff', // white text on danger button
} as const;

export const radius = {
  sm: '4px',  // inputs, small pills, chips
  md: '8px',  // default panels, buttons
  lg: '12px', // large modals, chat dock
} as const;

export const blur = {
  panel:  'blur(20px)', // standard glass
  subtle: 'blur(10px)', // HUD overlays / thin surfaces
} as const;

export const textShadow = {
  onGlass:        '0 1px 2px rgba(0, 0, 0, 0.8)',
  // Strong variant for numerics rendered directly over unpredictable scene art
  // (e.g. HP numbers sitting on top of fighter sprites, not on a panel surface).
  onGlassStrong:  '0 1px 2px rgba(0, 0, 0, 0.95), 0 0 6px rgba(0, 0, 0, 0.7)',
  none:           'none',
} as const;

export const shadow = {
  panel:     '0 12px 32px rgba(0, 0, 0, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  panelLift: '0 18px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  none:      'none',
} as const;

export const space = {
  xs: '4px',   // gap-1, tight chip padding
  sm: '8px',   // gap-2, small pill padding
  md: '16px',  // default panel padding
  lg: '24px',  // generous panel padding (modals)
  xl: '32px',  // header padding
} as const;

export const typography = {
  // Small uppercase captions / inline labels
  label: {
    fontSize: '11px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
  // Buttons and primary actions — tight enough to feel tactile, not ceremonial
  labelLarge: {
    fontSize: '13px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
  // Reserved for ceremonial display labels (YOUR TURN, section headers)
  labelDisplay: {
    fontSize: '12px',
    letterSpacing: '0.24em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
} as const;

export type SurfaceVariant = keyof typeof surface;
export type RadiusSize     = keyof typeof radius;
export type BlurSize       = keyof typeof blur;
export type SpaceSize      = keyof typeof space;
export type ShadowLevel    = keyof typeof shadow;
export type LabelTone      = 'neutral' | 'attack' | 'block' | 'accent';
