import {
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Users } from 'lucide-react';
import { Panel, TextInput } from '../primitives';
import { accent, text } from '../tokens';

export interface ChatTabDef {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Small inline count next to the label. Rendered as plain grey number, not a semantic pill. */
  badge?: number;
  /** Whatever renders in the content area when this tab is active. */
  content: ReactNode;
  /** Overrides the default input pill footer. Used by Battle Log to show a caption instead of an input. */
  footer?: ReactNode;
  /** Placeholder text when this tab uses the default input footer. */
  inputPlaceholder?: string;
}

export interface ChatPlayer {
  id: string | number;
  name: string;
  /** Defaults to true — current callers don't set this field, matching the "always online" visual. */
  online?: boolean;
}

export interface ChatDockProps {
  tabs: ChatTabDef[];
  /** Which tab shows on mount. Defaults to tabs[0].id. Not reactive after mount — use onTabChange to observe. */
  defaultActiveTabId?: string;
  onTabChange?: (id: string) => void;

  players: ChatPlayer[];
  /** Number displayed next to "Players in Chat". Defaults to players.length. */
  playersCount?: number;

  // Optional controlled input — if both handlers are absent the input is an
  // uncontrolled visual stub (matches current non-functional behavior).
  messageDraft?: string;
  onMessageDraftChange?: (val: string) => void;
  onSendMessage?: () => void;
}

// Fixed dock height — mirrors CHAT_DOCK_HEIGHT_PX in GameShell. Redeclared
// locally so the composed component doesn't depend on a shell constant.
const CHAT_DOCK_HEIGHT_PX = 170;

// Soft-hairline color — uses the cool silver tint from the legacy panel-border
// CSS variable, not the new pure-white border token. The fading gradient
// dividers carry a distinct visual feel (per Phase 1 audit); preserving
// their original tint keeps them reading as atmospheric, not structural.
const SOFT_HAIRLINE_COLOR = 'rgba(154, 154, 168, 0.18)';

// Online presence dot — jade green with glow. Kept as literal for clarity:
// the jade hue is a semantic "presence" signal, not a design-system surface.
const ONLINE_DOT_COLOR = '#5a8a7a';

const CHAT_INPUT_STYLE: CSSProperties = {
  borderRadius: 9999,
  padding: '6px 14px',
  fontSize: 12,
  background: 'rgba(15, 20, 28, 0.7)',
};

export function ChatDock({
  tabs,
  defaultActiveTabId,
  onTabChange,
  players,
  playersCount,
  messageDraft = '',
  onMessageDraftChange,
  onSendMessage,
}: ChatDockProps) {
  const [activeId, setActiveId] = useState<string>(
    defaultActiveTabId ?? tabs[0]?.id ?? '',
  );

  const activate = useCallback(
    (id: string) => {
      setActiveId(id);
      onTabChange?.(id);
    },
    [onTabChange],
  );

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const totalPlayers = playersCount ?? players.length;
  const inputWired = onMessageDraftChange != null;

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage?.();
    }
  };

  // Expose tokens as CSS custom properties so descendants (including the
  // content rendered by the caller into tab.content) can reference them
  // via Tailwind arbitrary-value classes like text-[var(--ds-accent-text)].
  const cssVars = {
    '--ds-accent-primary': accent.primary,
    '--ds-accent-text': accent.text,
    '--ds-text-primary': text.primary,
    '--ds-text-secondary': text.secondary,
    '--ds-text-muted': text.muted,
  } as CSSProperties;

  const panelStyle: CSSProperties = {
    ...cssVars,
    height: CHAT_DOCK_HEIGHT_PX,
    overflow: 'hidden',
  };

  const placeholder = activeTab?.inputPlaceholder ?? 'Type a message…';

  return (
    <Panel
      variant="glass"
      radius="lg"
      elevation="panelLift"
      bordered
      className="pointer-events-auto w-full max-w-5xl"
      style={panelStyle}
    >
      <div className="h-full flex items-stretch">
        {/* LEFT: chat column */}
        <div className="flex flex-col basis-3/4 grow min-w-0">
          {/* Tab row */}
          <div className="relative flex items-stretch h-9">
            {tabs.map((tab) => (
              <ChatTabButton
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                onClick={() => activate(tab.id)}
              />
            ))}
            <SoftHairline edge="bottom" />
          </div>

          {/* Content */}
          <div className="kombats-scroll flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {activeTab?.content}
          </div>

          {/* Footer: tab-specific override OR default input pill */}
          <div className="relative px-3 py-2">
            <SoftHairline edge="top" />
            {activeTab?.footer ? (
              activeTab.footer
            ) : inputWired ? (
              <TextInput
                value={messageDraft}
                onChange={onMessageDraftChange!}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                inputStyle={CHAT_INPUT_STYLE}
              />
            ) : (
              <StubInput placeholder={placeholder} />
            )}
          </div>
        </div>

        {/* RIGHT: players column */}
        <div className="relative flex flex-col basis-1/4 shrink-0 w-64">
          <VerticalSoftHairline />

          {/* Header row */}
          <div className="relative flex items-center gap-2 px-4 h-9">
            <Users className="w-3.5 h-3.5" style={{ color: accent.primary }} />
            <span
              className="text-[11px] uppercase"
              style={{ color: text.muted, letterSpacing: '0.18em' }}
            >
              Players in Chat
            </span>
            <span
              className="ml-auto text-[11px] tabular-nums"
              style={{ color: text.muted }}
            >
              {totalPlayers}
            </span>
            <SoftHairline edge="bottom" />
          </div>

          {/* List */}
          <div className="kombats-scroll flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {players.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// Bespoke fading-gradient horizontal hairline — preserved verbatim from
// the current LobbyChatDock per Phase 1 audit ("bespoke stays bespoke").
function SoftHairline({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-3 h-px"
      style={{
        [edge]: 0,
        background: `linear-gradient(90deg, transparent 0%, ${SOFT_HAIRLINE_COLOR} 50%, transparent 100%)`,
      }}
    />
  );
}

// Vertical fading-gradient column separator between chat and players.
function VerticalSoftHairline() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-3 bottom-3 w-px"
      style={{
        background: `linear-gradient(180deg, transparent 0%, ${SOFT_HAIRLINE_COLOR} 50%, transparent 100%)`,
      }}
    />
  );
}

function ChatTabButton({
  tab,
  active,
  onClick,
}: {
  tab: ChatTabDef;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 h-full text-[11px] uppercase tracking-[0.18em] focus:outline-none transition-colors duration-150 ${
        active
          ? 'text-[var(--ds-text-primary)]'
          : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] focus:text-[var(--ds-text-primary)]'
      }`}
    >
      {tab.icon && (
        <span
          className={`flex ${active ? 'text-[var(--ds-accent-primary)]' : ''}`}
        >
          {tab.icon}
        </span>
      )}
      <span>{tab.label}</span>
      {tab.badge !== undefined && (
        <span
          className="ml-1 text-[10px] tabular-nums"
          style={{ color: text.muted }}
        >
          {tab.badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 right-3 bottom-0 h-[2px] rounded-full"
          style={{
            background: accent.primary,
            boxShadow: '0 0 10px rgba(201, 162, 90, 0.45)',
          }}
        />
      )}
    </button>
  );
}

function PlayerRow({ player }: { player: ChatPlayer }) {
  const online = player.online !== false;
  const dotColor = online ? ONLINE_DOT_COLOR : text.muted;
  const dotShadow = online ? `0 0 6px ${ONLINE_DOT_COLOR}` : 'none';

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/[0.03] transition-colors cursor-pointer">
      <span
        className="shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: dotColor,
          boxShadow: dotShadow,
        }}
      />
      <span
        className="text-xs truncate"
        style={{ color: text.secondary }}
      >
        {player.name}
      </span>
    </div>
  );
}

// Uncontrolled visual stub — matches the current non-wired chat input:
// user can type freely, nothing is stored or sent. Used when the caller
// passes no message handlers.
function StubInput({ placeholder }: { placeholder: string }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className="w-full focus:outline-none placeholder:text-[rgba(232,232,240,0.48)] transition-colors"
      style={{
        ...CHAT_INPUT_STYLE,
        color: text.primary,
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxSizing: 'border-box',
      }}
    />
  );
}
