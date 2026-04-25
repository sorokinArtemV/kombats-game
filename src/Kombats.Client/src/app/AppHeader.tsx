import { useCallback, useState, type FocusEvent } from 'react';
import {
  Bell,
  Info,
  LogOut,
  Settings,
  Store,
  Swords,
  Trophy,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/hooks';

// Glass header surface — multi-stop alpha gradient that can't be expressed
// as a Tailwind utility, plus the `ease` timing curve for the border-color
// reveal (Tailwind's default is ease-in-out). Mirrors the panelStyle in
// design_V2/composed/TopNavBar.tsx exactly.
const headerSurfaceStyle = {
  background:
    'linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, rgba(15, 20, 28, 0.35) 50%, transparent 100%)',
  transition: 'border-color 300ms ease',
};

// Content-row opacity transition uses ease (300ms) to match design_V2.
const contentRowStyle = {
  transition: 'opacity 300ms ease',
};

// Wordmark gold halo behind the KOMBATS letters.
const wordmarkBloomStyle = {
  textShadow: 'var(--shadow-title-soft)',
};

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'game-info',
    label: 'Game Info',
    icon: <Info className="h-3.5 w-3.5" aria-hidden />,
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    icon: <Trophy className="h-3.5 w-3.5" aria-hidden />,
  },
  {
    id: 'shop',
    label: 'Shop',
    icon: <Store className="h-3.5 w-3.5" aria-hidden />,
  },
  {
    id: 'training',
    label: 'Training',
    icon: <Swords className="h-3.5 w-3.5" aria-hidden />,
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: <UserCircle className="h-3.5 w-3.5" aria-hidden />,
  },
];

export function AppHeader() {
  const { logout } = useAuth();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const revealed = hovered || focused;

  const handleBlur = useCallback((e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFocused(false);
    }
  }, []);

  return (
    <header
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={`relative w-full border-b backdrop-blur-[20px] ${
        revealed ? 'border-accent-primary/40' : 'border-border-subtle'
      }`}
      style={headerSurfaceStyle}
    >
      <div
        className={`flex items-center justify-between px-8 py-3 ${
          revealed ? 'opacity-100' : 'opacity-70'
        }`}
        style={contentRowStyle}
      >
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="kombats-diamond"
            style={
              {
                ['--kombats-diamond-size' as string]: '36px',
                ['--kombats-diamond-glyph-size' as string]: '18px',
                boxShadow: 'var(--shadow-accent-soft)',
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
              className="mt-1.5 font-wordmark text-[22px] font-semibold leading-none tracking-[0.34em] text-accent-primary"
              style={wordmarkBloomStyle}
            >
              KOMBATS
            </span>
          </div>
        </div>

        <nav className="flex items-center">
          {NAV_ITEMS.map((item) => (
            <NavPlaceholder
              key={item.id}
              icon={item.icon}
              label={item.label}
            />
          ))}

          <span
            aria-hidden
            className="mx-2 h-5 w-px bg-border-subtle"
          />

          <IconActionPlaceholder
            icon={<Bell className="h-4 w-4" aria-hidden />}
            label="Notifications"
          />
          <IconActionPlaceholder
            icon={<Settings className="h-4 w-4" aria-hidden />}
            label="Settings"
          />
          <IconActionButton
            icon={<LogOut className="h-4 w-4" aria-hidden />}
            label="Logout"
            onClick={logout}
          />
        </nav>
      </div>
    </header>
  );
}

interface NavPlaceholderProps {
  icon: React.ReactNode;
  label: string;
}

function NavPlaceholder({ icon, label }: NavPlaceholderProps) {
  return (
    <span
      aria-disabled="true"
      title="Coming soon"
      className="nav-item relative inline-flex cursor-not-allowed items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted transition-colors duration-200 hover:text-accent-primary"
    >
      {icon}
      <span>{label}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-0 -translate-x-1/2 bg-accent-primary transition-all duration-300 [.nav-item:hover_&]:w-full [.nav-item:focus_&]:w-full"
      />
    </span>
  );
}

interface IconActionProps {
  icon: React.ReactNode;
  label: string;
}

function IconActionPlaceholder({ icon, label }: IconActionProps) {
  return (
    <span
      role="button"
      aria-label={label}
      aria-disabled="true"
      title="Coming soon"
      className="cursor-not-allowed p-2 text-text-muted"
    >
      {icon}
    </span>
  );
}

interface IconActionButtonProps extends IconActionProps {
  onClick: () => void;
}

function IconActionButton({ icon, label, onClick }: IconActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="p-2 text-text-muted transition-colors hover:text-accent-primary focus:text-accent-primary focus:outline-none"
    >
      {icon}
    </button>
  );
}
