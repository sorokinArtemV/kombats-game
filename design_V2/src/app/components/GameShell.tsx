import { useState } from 'react';
import {
  MessageCircle,
  Users,
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

function LobbyNavButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="nav-item relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--kombats-moon-silver)] hover:text-[var(--kombats-gold)] focus:text-[var(--kombats-gold)] focus:outline-none transition-colors duration-200"
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 w-0 h-px bg-[var(--kombats-gold)] [.nav-item:hover_&]:w-full [.nav-item:focus_&]:w-full transition-all duration-300" />
    </button>
  );
}

function LobbyIconAction({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="p-2 text-[var(--kombats-moon-silver)] hover:text-[var(--kombats-gold)] focus:text-[var(--kombats-gold)] focus:outline-none transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

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
    <div className="lobby-hdr relative">
      <div className="bg-gradient-to-b from-black/55 via-[var(--kombats-ink-navy)]/35 to-transparent backdrop-blur-md border-b border-[var(--kombats-panel-border)]/30 [.lobby-hdr:hover_&]:border-[var(--kombats-gold)]/35 [.lobby-hdr:focus-within_&]:border-[var(--kombats-gold)]/35 transition-all duration-300">
        <div className="px-8 py-3 flex items-center justify-between opacity-70 [.lobby-hdr:hover_&]:opacity-100 [.lobby-hdr:focus-within_&]:opacity-100 transition-opacity duration-300">
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <div
              className="relative w-9 h-9 flex items-center justify-center rotate-45 border border-[var(--kombats-gold)]/55 bg-[var(--kombats-gold)]/5"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(201,169,97,0.08), 0 0 14px rgba(201,169,97,0.18)' }}
            >
              <span
                className="-rotate-45 text-[var(--kombats-gold)] text-lg leading-none"
                style={{ fontFamily: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif' }}
              >
                拳
              </span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] text-[var(--kombats-moon-silver)] tracking-[0.5em] uppercase">
                The
              </span>
              <span
                className="mt-1.5 text-[22px] text-[var(--kombats-gold)] tracking-[0.34em] leading-none"
                style={{
                  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
                  fontWeight: 600,
                  textShadow: '0 2px 12px rgba(201,169,97,0.3)'
                }}
              >
                KOMBATS
              </span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex items-center">
            <LobbyNavButton icon={Info} label="Game Info" onClick={onGameInfo} />
            <LobbyNavButton icon={Trophy} label="Leaderboard" onClick={onLeaderboard} />
            <LobbyNavButton icon={Store} label="Shop" onClick={onShop} />
            <LobbyNavButton icon={Swords} label="Training" onClick={onTraining} />
            <LobbyNavButton icon={UserCircle} label="Profile" onClick={onProfile} />
            <div className="mx-2 w-px h-5 bg-[var(--kombats-panel-border)]" />
            <LobbyIconAction icon={Bell} label="Notifications" />
            <LobbyIconAction icon={Settings} label="Settings" onClick={onSettings} />
            <LobbyIconAction icon={LogOut} label="Logout" onClick={onLogout} />
          </nav>
        </div>
      </div>
    </div>
  );
}

// ==================== UNIFIED LOBBY CHAT DOCK ====================
// Single shared chat module. Used identically on every screen that shows a
// lower chat (lobby / battle / victory / defeat). One fixed height, one
// layout, one visual treatment.

// Shared hairline used throughout the chat dock. Fades at the edges so no
// divider reads as a hard line — the dock feels like one continuous glass
// surface rather than a collection of stacked panels.
const SOFT_HAIRLINE_CLASS =
  'pointer-events-none absolute inset-x-3 h-px bg-gradient-to-r from-transparent via-[var(--kombats-panel-border)] to-transparent';

function ChatTab({
  active,
  onClick,
  icon: Icon,
  label,
  badge
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ElementType;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 h-full text-[11px] uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'text-[var(--kombats-text-primary)]'
          : 'text-[var(--kombats-text-muted)]/80 hover:text-[var(--kombats-text-primary)]'
      }`}
    >
      {Icon && (
        <Icon
          className={`w-3.5 h-3.5 ${active ? 'text-[var(--kombats-gold)]' : ''}`}
        />
      )}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="ml-1 text-[10px] text-[var(--kombats-moon-silver)] tabular-nums">
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 right-3 bottom-0 h-[2px] rounded-full bg-[var(--kombats-gold)] shadow-[0_0_10px_rgba(201,169,97,0.45)]"
        />
      )}
    </button>
  );
}

export function LobbyChatDock({
  messages,
  onlineUsers,
  battleLog,
}: {
  messages: Array<{ id: string | number; user: string; text: string }>;
  onlineUsers: Array<{ id: string | number; name: string }>;
  battleLog?: BattleLogEntry[];
}) {
  const showBattleLog = battleLog !== undefined;
  type Tab = 'general' | 'dm' | 'battle';
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const isChatTab = activeTab === 'general' || activeTab === 'dm';

  return (
    <div
      className="pointer-events-auto w-full max-w-5xl relative overflow-hidden rounded-xl"
      style={{
        height: `${CHAT_DOCK_HEIGHT_PX}px`,
        background: 'rgba(15, 20, 28, 0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '0.5px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
      }}
    >
      <div className="h-full flex items-stretch">
        {/* LEFT: Chat + Battle Log (≈75%) */}
        <div className="flex flex-col basis-3/4 grow min-w-0">
          {/* Tabs — no solid tab-row background; integrated onto the surface */}
          <div className="relative flex items-stretch h-9">
            <ChatTab
              active={activeTab === 'general'}
              onClick={() => setActiveTab('general')}
              icon={MessageCircle}
              label="General"
            />
            <ChatTab
              active={activeTab === 'dm'}
              onClick={() => setActiveTab('dm')}
              label="DM"
            />
            {showBattleLog && (
              <ChatTab
                active={activeTab === 'battle'}
                onClick={() => setActiveTab('battle')}
                icon={ScrollText}
                label="Battle Log"
                badge={battleLog!.length || undefined}
              />
            )}
            <div aria-hidden className={`${SOFT_HAIRLINE_CLASS} bottom-0`} />
          </div>

          {/* Content area */}
          <div className="kombats-scroll flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {activeTab === 'general' && (
              <div className="space-y-1.5">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className="text-xs leading-relaxed"
                    style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}
                  >
                    <span style={{ color: 'rgba(201, 162, 90, 0.9)' }}>{msg.user}:</span>{' '}
                    <span className="text-[var(--kombats-text-secondary)]">{msg.text}</span>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'dm' && (
              <div className="text-xs text-[var(--kombats-text-muted)] text-center py-10">
                No direct messages
              </div>
            )}
            {activeTab === 'battle' && (
              <BattleLogFeed entries={battleLog ?? []} />
            )}
          </div>

          {/* Footer — input pill on chat tabs, quiet label on battle log */}
          <div className="relative px-3 py-2">
            <div aria-hidden className={`${SOFT_HAIRLINE_CLASS} top-0`} />
            {isChatTab ? (
              <input
                type="text"
                placeholder={activeTab === 'dm' ? 'Send a direct message…' : 'Type a message…'}
                className="w-full px-3.5 py-1.5 border border-white/[0.06] rounded-full text-xs text-[var(--kombats-text-primary)] placeholder:text-[var(--kombats-text-muted)] focus:outline-none focus:border-[var(--kombats-gold)]/40 transition-colors"
                style={{ background: 'rgba(15, 20, 28, 0.7)' }}
              />
            ) : (
              <div className="flex items-center gap-2 px-1 h-7 text-[10px] uppercase tracking-[0.22em] text-[var(--kombats-text-muted)]">
                <ScrollText className="w-3 h-3 text-[var(--kombats-gold)]" />
                Current Match
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Players panel — same surface, soft fading divider */}
        <div className="relative flex flex-col basis-1/4 shrink-0 w-64">
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-[var(--kombats-panel-border)] to-transparent"
          />
          <div className="relative flex items-center gap-2 px-4 h-9">
            <Users className="w-3.5 h-3.5 text-[var(--kombats-gold)]" />
            <span className="text-[11px] text-[var(--kombats-text-muted)] uppercase tracking-[0.18em]">
              Players in Chat
            </span>
            <span className="ml-auto text-[11px] text-[var(--kombats-moon-silver)] tabular-nums">
              {onlineUsers.length}
            </span>
            <div aria-hidden className={`${SOFT_HAIRLINE_CLASS} bottom-0`} />
          </div>

          <div className="kombats-scroll flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {onlineUsers.map(user => (
              <div
                key={user.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--kombats-jade)] shadow-[0_0_6px_var(--kombats-jade)]" />
                <span
                  className="text-xs text-[var(--kombats-text-primary)] truncate"
                  style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}
                >
                  {user.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
