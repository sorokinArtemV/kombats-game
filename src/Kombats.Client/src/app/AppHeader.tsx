import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/modules/auth/hooks';
import { usePlayerStore } from '@/modules/player/store';

export function AppHeader() {
  const { displayName, logout } = useAuth();
  const character = usePlayerStore((s) => s.character);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const profileLabel = character?.name ?? displayName ?? 'Profile';

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <header className="flex items-center gap-6 border-b border-border bg-bg-nav px-4 py-2">
      <span className="font-display text-base font-semibold tracking-[0.15em] text-text-primary">
        KOMBATS
      </span>

      <nav className="hidden flex-1 items-center gap-1 sm:flex">
        <NavLink>News</NavLink>
        <NavLink>Rules</NavLink>
        <NavLink>FAQ</NavLink>
        <NavLink>Community</NavLink>
      </nav>

      <div className="ml-auto flex items-center gap-3" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
        >
          <ProfileIcon />
          <span className="max-w-[10rem] truncate">{profileLabel}</span>
        </button>
        {menuOpen && (
          <div className="absolute right-4 top-12 z-30 min-w-[10rem] rounded-md border border-border bg-bg-secondary py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="block w-full px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function NavLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
    >
      {children}
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
