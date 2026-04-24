import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from '@/modules/auth/hooks';
import { usePlayerStore } from '@/modules/player/store';

// Glass header surface — fade-from-black gradient that lets scene content
// peek through. DESIGN_REFERENCE.md §5.8 — not expressible as a Tailwind
// utility (multi-stop linear-gradient with alpha values).
const headerSurfaceStyle = {
  background:
    'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(15,20,28,0.35) 50%, transparent 100%)',
};

// Cinzel wordmark bloom (the gold halo behind the KOMBATS letters).
// DESIGN_REFERENCE.md §3.4 / §5.8.
const wordmarkBloomStyle = {
  textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
};

export function AppHeader() {
  const { displayName, logout } = useAuth();
  const character = usePlayerStore((s) => s.character);
  const [revealed, setRevealed] = useState(false);

  const profileLabel = character?.name ?? displayName ?? 'Profile';

  return (
    <header
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      className={`relative w-full border-b transition-[border-color,opacity] duration-300 ${
        revealed ? 'border-kombats-gold/40' : 'border-border-subtle'
      }`}
      style={headerSurfaceStyle}
    >
      <div
        className={`flex items-center justify-between px-8 py-3 transition-opacity duration-300 ${
          revealed ? 'opacity-100' : 'opacity-70'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="kombats-diamond"
            style={
              {
                ['--kombats-diamond-size' as string]: '36px',
                ['--kombats-diamond-glyph-size' as string]: '18px',
                boxShadow:
                  'inset 0 0 0 1px rgba(201, 162, 90, 0.08), 0 0 14px rgba(201, 162, 90, 0.18)',
              } as React.CSSProperties
            }
          >
            <span className="kombats-diamond-glyph">拳</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[9px] uppercase tracking-[0.5em] text-text-muted">
              The
            </span>
            <span
              className="mt-1.5 font-display text-[22px] font-semibold uppercase leading-none tracking-[0.34em] text-kombats-gold"
              style={wordmarkBloomStyle}
            >
              KOMBATS
            </span>
          </div>
        </div>

        <nav className="hidden flex-1 items-center justify-center gap-8 sm:flex">
          <NavLink>News</NavLink>
          <NavLink>Rules</NavLink>
          <NavLink>FAQ</NavLink>
          <NavLink>Community</NavLink>
        </nav>

        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="hidden h-5 w-px bg-border-subtle sm:block"
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary transition-colors duration-150 hover:text-kombats-gold focus:outline-none focus-visible:text-kombats-gold data-[state=open]:text-kombats-gold"
              >
                <ProfileIcon />
                <span className="max-w-[10rem] truncate normal-case tracking-normal">
                  {profileLabel}
                </span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-30 min-w-[10rem] overflow-hidden rounded-md border-[0.5px] border-border-subtle bg-glass py-1 shadow-[var(--shadow-panel)] backdrop-blur-[20px]"
              >
                <DropdownMenu.Item
                  onSelect={() => {
                    logout();
                  }}
                  className="block w-full cursor-pointer px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-text-secondary outline-none transition-colors duration-150 data-[highlighted]:bg-white/[0.04] data-[highlighted]:text-kombats-gold"
                >
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}

function NavLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="group relative px-1 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-150 hover:text-kombats-gold focus:outline-none focus-visible:text-kombats-gold"
    >
      {children}
      <span
        aria-hidden
        className="absolute -bottom-0.5 left-1/2 h-px w-0 -translate-x-1/2 bg-kombats-gold transition-all duration-300 group-hover:w-full group-focus-visible:w-full"
      />
    </button>
  );
}

function ProfileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
