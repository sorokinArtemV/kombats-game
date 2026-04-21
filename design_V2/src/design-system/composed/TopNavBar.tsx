import {
  useCallback,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { Panel } from '../primitives';
import { accent, space, text } from '../tokens';

export interface TopNavLogo {
  /** Inline glyph (e.g. "拳"). Rendered inside the rotated diamond frame. */
  glyph: ReactNode;
  /** Small caption above the title (e.g. "The"). */
  eyebrow: string;
  /** Brand wordmark — rendered with Cinzel serif + gold glow. */
  title: string;
}

export interface TopNavItem {
  id: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  /** Persistent full-width gold underline + gold text. Distinct from hover's growing underline. */
  active?: boolean;
}

export interface TopNavAction {
  id: string;
  icon: ReactNode;
  /** Used as aria-label — icon actions are icon-only, no visible text. */
  label: string;
  onClick?: () => void;
}

export interface TopNavBarProps {
  logo: TopNavLogo;
  navItems: TopNavItem[];
  rightActions: TopNavAction[];
}

// Color component of border.subtle — used for the vertical hairline separator
// and the default bottom-border color (kept as a raw literal since JS can't
// participate in Tailwind's build-time class evaluation).
const BORDER_SUBTLE_COLOR = 'rgba(255, 255, 255, 0.06)';
// Hover/focus-within tint for the bottom border — gold at 40% alpha.
// Matches the legacy "reveal on interact" aesthetic using the new gold hue.
const BORDER_HOVER_COLOR = 'rgba(201, 162, 90, 0.40)';

export function TopNavBar({ logo, navItems, rightActions }: TopNavBarProps) {
  // Hover and focus drive the same "reveal" state — but they're tracked
  // separately so that blurring back inside the container doesn't kill it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const revealed = hovered || focused;

  // focus-within semantics in JS: onBlur only clears focus if the relatedTarget
  // (where focus is going) is NOT a descendant of the container.
  const handleBlur = useCallback((e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFocused(false);
    }
  }, []);

  // Expose tokens as CSS custom properties so Tailwind arbitrary-value
  // classes on descendants can reference them via var(--ds-*). Tailwind
  // can't inline JS constants into class names at build time, but
  // `var(--name)` is a static string it can parse.
  const cssVars = {
    '--ds-accent-primary': accent.primary,
    '--ds-accent-text': accent.text,
    '--ds-text-muted': text.muted,
  } as CSSProperties;

  // Panel's `border: 'none'` (from bordered={false}) is declared first in the
  // inline style object; our longhand `borderBottom` below overrides just the
  // bottom side. Transition on border-color animates the hover tint shift.
  // borderRadius override: a full-bleed top nav bar shouldn't have rounded
  // bottom corners — it reads as a floating card instead of a wall-to-wall
  // header. Panel's radius="sm" is clamped to 0 here for this surface only.
  const panelStyle: CSSProperties = {
    background:
      'linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, rgba(15, 20, 28, 0.35) 50%, transparent 100%)',
    borderBottom: `1px solid ${revealed ? BORDER_HOVER_COLOR : BORDER_SUBTLE_COLOR}`,
    borderRadius: 0,
    transition: 'border-color 300ms ease',
  };

  // One-off literal vertical padding. Current header is px-8 py-3 = 32/12px.
  // space.md (16px) would make the bar a hair taller without visual gain;
  // 12px here is a documented deviation from the token scale for this
  // specific surface only.
  const contentStyle: CSSProperties = {
    padding: `12px ${space.xl}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: revealed ? 1 : 0.7,
    transition: 'opacity 300ms ease',
  };

  return (
    <div
      className="lobby-hdr relative"
      style={cssVars}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    >
      <Panel
        variant="glassSubtle"
        radius="sm"
        bordered={false}
        elevation="none"
        style={panelStyle}
      >
        <div style={contentStyle}>
          <Logo {...logo} />
          <nav style={{ display: 'flex', alignItems: 'center' }}>
            {navItems.map((item) => (
              <NavButton key={item.id} {...item} />
            ))}
            <div
              aria-hidden
              style={{
                width: 1,
                height: 20,
                marginLeft: space.sm,
                marginRight: space.sm,
                background: BORDER_SUBTLE_COLOR,
              }}
            />
            {rightActions.map((action) => (
              <IconAction key={action.id} {...action} />
            ))}
          </nav>
        </div>
      </Panel>
    </div>
  );
}

// Logo is intentionally inline/bespoke — the rotated diamond frame + Cinzel
// wordmark is brand-specific, not a reusable primitive pattern.
function Logo({ glyph, eyebrow, title }: TopNavLogo) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(45deg)',
          border: '1px solid rgba(201, 162, 90, 0.55)',
          background: 'rgba(201, 162, 90, 0.05)',
          boxShadow:
            'inset 0 0 0 1px rgba(201, 162, 90, 0.08), 0 0 14px rgba(201, 162, 90, 0.18)',
        }}
      >
        <span
          style={{
            transform: 'rotate(-45deg)',
            color: accent.primary,
            fontSize: 18,
            lineHeight: 1,
            fontFamily: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif',
          }}
        >
          {glyph}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span
          style={{
            fontSize: 9,
            color: text.muted,
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </span>
        <span
          style={{
            marginTop: 6,
            fontSize: 22,
            color: accent.primary,
            letterSpacing: '0.34em',
            lineHeight: 1,
            fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
            fontWeight: 600,
            textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
          }}
        >
          {title}
        </span>
      </div>
    </div>
  );
}

function NavButton({ icon, label, onClick, active }: TopNavItem) {
  // Active: permanent full-width underline + gold text.
  // Hover/focus: underline grows from 0 to full + text shifts gold.
  return (
    <button
      onClick={onClick}
      className={`nav-item relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] focus:outline-none transition-colors duration-200 ${
        active
          ? 'text-[var(--ds-accent-primary)]'
          : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-accent-primary)] focus:text-[var(--ds-accent-primary)]'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        aria-hidden
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 h-px bg-[var(--ds-accent-primary)] transition-all duration-300 ${
          active
            ? 'w-full'
            : 'w-0 [.nav-item:hover_&]:w-full [.nav-item:focus_&]:w-full'
        }`}
      />
    </button>
  );
}

function IconAction({ icon, label, onClick }: TopNavAction) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="p-2 text-[var(--ds-text-muted)] hover:text-[var(--ds-accent-primary)] focus:text-[var(--ds-accent-primary)] focus:outline-none transition-colors"
    >
      {icon}
    </button>
  );
}
