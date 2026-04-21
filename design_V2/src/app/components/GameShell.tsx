import { useState } from 'react';
import {
  MessageCircle,
  Settings,
  LogOut,
  ChevronUp,
  ChevronDown,
  Info,
  Trophy,
  Swords,
  UserCircle,
  Bell,
  Store,
  ScrollText
} from 'lucide-react';
import { IconButton } from './KombatsUI';
import { TopNavBar, ChatDock, type ChatTabDef } from '../../design-system/composed';

// ==================== SHARED CHAT DOCK LAYOUT CONSTANTS ====================
// One source of truth for the lower chat module's footprint. Every screen
// (lobby / battle / victory / defeat) uses the exact same dock height, so
// center overlays can reserve the same safe area on every screen.

export const CHAT_DOCK_HEIGHT_PX = 170;
// Dock height + its bottom offset (bottom-4 = 16px) + breathing room so the
// center overlay/module never visually collides with the chat module.
export const CHAT_DOCK_SAFE_AREA_PX = CHAT_DOCK_HEIGHT_PX + 16 + 24;

// ==================== BATTLE LOG TYPES ====================

export type BattleLogOutcome =
  | 'hit'
  | 'critical'
  | 'blocked'
  | 'victory'
  | 'defeat'
  | 'info';

export interface BattleLogEntry {
  id: string;
  round: number;
  text: string;
  outcome: BattleLogOutcome;
}

function outcomeColor(outcome: BattleLogOutcome): string {
  switch (outcome) {
    case 'hit':
    case 'critical':
    case 'defeat':
      return 'var(--kombats-crimson)';
    case 'blocked':
    case 'victory':
      return 'var(--kombats-jade)';
    default:
      return 'var(--kombats-moon-silver)';
  }
}

function outcomeLabel(outcome: BattleLogOutcome): string {
  switch (outcome) {
    case 'hit':
      return 'Hit';
    case 'critical':
      return 'Crit';
    case 'blocked':
      return 'Blocked';
    case 'victory':
      return 'Victory';
    case 'defeat':
      return 'Defeat';
    default:
      return '';
  }
}

// ==================== HEADER ====================

export function GameHeader({ onSettings, onLogout }: { onSettings?: () => void; onLogout?: () => void }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="relative">
      <div className={`bg-[var(--kombats-panel)]/75 backdrop-blur-md border-b border-[var(--kombats-panel-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ${
        isCollapsed ? 'h-2' : 'h-auto'
      }`}>
        {!isCollapsed && (
          <div className="px-8 py-3 flex justify-between items-center">
            <div className="text-xl text-[var(--kombats-gold)] tracking-[0.25em]">KOMBATS</div>
            <div className="flex gap-2">
              <IconButton icon={Settings} label="Settings" onClick={onSettings} />
              <IconButton icon={LogOut} label="Logout" onClick={onLogout} />
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 px-3 py-1 bg-[var(--kombats-panel)]/85 backdrop-blur-md border border-[var(--kombats-panel-border)] rounded-sm hover:bg-[var(--kombats-panel-highlight)] transition-colors"
      >
        {isCollapsed ? (
          <ChevronDown className="w-3 h-3 text-[var(--kombats-moon-silver)]" />
        ) : (
          <ChevronUp className="w-3 h-3 text-[var(--kombats-moon-silver)]" />
        )}
      </button>
    </div>
  );
}

// ==================== LOBBY HEADER (premium) ====================

export function LobbyHeader({
  onSettings,
  onLogout,
  onGameInfo,
  onLeaderboard,
  onShop,
  onTraining,
  onProfile
}: {
  onSettings?: () => void;
  onLogout?: () => void;
  onGameInfo?: () => void;
  onLeaderboard?: () => void;
  onShop?: () => void;
  onTraining?: () => void;
  onProfile?: () => void;
}) {
  return (
    <TopNavBar
      logo={{ glyph: '拳', eyebrow: 'The', title: 'KOMBATS' }}
      navItems={[
        { id: 'game-info',   icon: <Info className="w-3.5 h-3.5" />,       label: 'Game Info',   onClick: onGameInfo },
        { id: 'leaderboard', icon: <Trophy className="w-3.5 h-3.5" />,     label: 'Leaderboard', onClick: onLeaderboard },
        { id: 'shop',        icon: <Store className="w-3.5 h-3.5" />,      label: 'Shop',        onClick: onShop },
        { id: 'training',    icon: <Swords className="w-3.5 h-3.5" />,     label: 'Training',    onClick: onTraining },
        { id: 'profile',     icon: <UserCircle className="w-3.5 h-3.5" />, label: 'Profile',     onClick: onProfile },
      ]}
      rightActions={[
        { id: 'notifications', icon: <Bell className="w-4 h-4" />,     label: 'Notifications' },
        { id: 'settings',      icon: <Settings className="w-4 h-4" />, label: 'Settings', onClick: onSettings },
        { id: 'logout',        icon: <LogOut className="w-4 h-4" />,   label: 'Logout',   onClick: onLogout },
      ]}
    />
  );
}

// ==================== UNIFIED LOBBY CHAT DOCK ====================
// Thin adapter around the design-system ChatDock: this component knows the
// app's data shapes (messages, onlineUsers, battleLog entries) and translates
// them into the ChatDock's generic tabs/content/players API. Screens keep
// their existing prop signatures — no migration churn outside GameShell.

export function LobbyChatDock({
  messages,
  onlineUsers,
  battleLog,
}: {
  messages: Array<{ id: string | number; user: string; text: string }>;
  onlineUsers: Array<{ id: string | number; name: string }>;
  battleLog?: BattleLogEntry[];
}) {
  const tabs: ChatTabDef[] = [
    {
      id: 'general',
      label: 'General',
      icon: <MessageCircle className="w-3.5 h-3.5" />,
      content: <MessagesList messages={messages} />,
      inputPlaceholder: 'Type a message…',
    },
    {
      id: 'dm',
      label: 'DM',
      content: <EmptyState>No direct messages</EmptyState>,
      inputPlaceholder: 'Send a direct message…',
    },
  ];

  if (battleLog !== undefined) {
    tabs.push({
      id: 'battle',
      label: 'Battle Log',
      icon: <ScrollText className="w-3.5 h-3.5" />,
      badge: battleLog.length || undefined,
      content: <BattleLogFeed entries={battleLog} />,
      footer: (
        <div className="flex items-center gap-2 px-1 h-7 text-[10px] uppercase tracking-[0.22em] text-[var(--ds-text-muted)]">
          <ScrollText className="w-3 h-3 text-[var(--ds-accent-primary)]" />
          Current Match
        </div>
      ),
    });
  }

  return <ChatDock tabs={tabs} players={onlineUsers} />;
}

// Per the Phase 2 chat spec: 13px sender + body, weight 500 on sender,
// body in text.primary (via the --ds-text-primary CSS var exposed by
// ChatDock's root), no text-shadow.
function MessagesList({
  messages,
}: {
  messages: Array<{ id: string | number; user: string; text: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {messages.map(msg => (
        <div key={msg.id} className="text-[13px] leading-relaxed">
          <span className="font-medium text-[var(--ds-accent-text)]">
            {msg.user}:
          </span>{' '}
          <span className="text-[var(--ds-text-primary)]">{msg.text}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-center py-10 text-[var(--ds-text-muted)]">
      {children}
    </div>
  );
}

// ==================== BATTLE LOG UI ====================

function BattleLogFeed({ entries }: { entries: BattleLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-xs text-[var(--kombats-text-muted)] text-center py-10 uppercase tracking-wider">
        Combat has not begun
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map(entry => {
        const color = outcomeColor(entry.outcome);
        const label = outcomeLabel(entry.outcome);
        return (
          <div
            key={entry.id}
            className="flex items-start gap-2 text-xs leading-relaxed"
            style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}
          >
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--kombats-text-muted)] pt-[1px]">
              R{entry.round}
            </span>
            <span className="flex-1 text-[var(--kombats-text-secondary)]">
              {entry.text}
            </span>
            {label && (
              <span
                className="shrink-0 text-[9px] uppercase tracking-[0.18em] px-1.5 py-[1px] border rounded-sm"
                style={{
                  color,
                  borderColor: `${color}55`,
                  background: `${color}14`,
                }}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact recap shown on Victory/Defeat screens — the final exchange only,
 * not the full match log.
 */
export function BattleLogRecap({
  entry,
  tone,
}: {
  entry: BattleLogEntry | undefined;
  tone: 'victory' | 'defeat';
}) {
  if (!entry) return null;
  const accent =
    tone === 'victory' ? 'var(--kombats-jade)' : 'var(--kombats-crimson)';
  const label = outcomeLabel(entry.outcome);
  const labelColor = outcomeColor(entry.outcome);

  return (
    <div
      className="px-4 py-3 border-l-2 bg-[var(--kombats-smoke-gray)]/30 rounded-r-sm"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--kombats-text-muted)] flex items-center gap-1.5">
          <ScrollText className="w-3 h-3" style={{ color: accent }} />
          Final Exchange · Round {entry.round}
        </span>
        {label && (
          <span
            className="text-[9px] uppercase tracking-[0.18em] px-1.5 py-[1px] border rounded-sm"
            style={{
              color: labelColor,
              borderColor: `${labelColor}55`,
              background: `${labelColor}14`,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div className="text-sm text-[var(--kombats-text-primary)] leading-snug">
        {entry.text}
      </div>
    </div>
  );
}

// ==================== SHELL WRAPPER ====================

export function GameShell({
  children,
  header,
  bottomOverlay
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  bottomOverlay?: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--kombats-ink-navy)]">
      {/* Main content fills entire screen so background scene is visible edge-to-edge */}
      <div className="absolute inset-0 z-0">
        {children}
      </div>

      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-30">
        {header ?? <GameHeader />}
      </div>

      {/* Bottom overlay — shared chat dock on every screen that supplies one */}
      {bottomOverlay && (
        <div className="absolute bottom-4 left-0 right-0 z-30 px-4 flex justify-center items-end gap-3 pointer-events-none">
          {bottomOverlay}
        </div>
      )}
    </div>
  );
}
