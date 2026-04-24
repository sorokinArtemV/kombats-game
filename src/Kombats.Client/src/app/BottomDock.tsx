import { useState } from 'react';
import { ChatPanel } from '@/modules/chat/components/ChatPanel';
import { OnlinePlayersList } from '@/modules/chat/components/OnlinePlayersList';
import { DirectMessagePanel } from '@/modules/chat/components/DirectMessagePanel';
import { ConversationList } from '@/modules/chat/components/ConversationList';
import { ChatErrorDisplay } from '@/modules/chat/components/ChatErrorDisplay';
import { PlayerCard } from '@/modules/player/components/PlayerCard';
import { Sheet } from '@/ui/components/Sheet';

interface ActiveDm {
  otherPlayerId: string;
  displayName: string;
}

/**
 * Persistent bottom dock — global chat (flex) + online players list (320px),
 * matching the design composition. Sits beneath both lobby and battle so the
 * chat connection (already mounted at SessionShell level) stays usable.
 *
 * DMs open in a side sheet rather than replacing the global chat panel,
 * because the design's bottom dock is always-visible Room Chat + Players.
 */
export function BottomDock() {
  const [activeDm, setActiveDm] = useState<ActiveDm | null>(null);
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);
  const [conversationsOpen, setConversationsOpen] = useState(false);

  const openDm = (otherPlayerId: string, displayName: string) => {
    setActiveDm({ otherPlayerId, displayName });
    setConversationsOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 px-4 pb-3">
      <div className="flex h-full min-h-0 w-full overflow-hidden rounded-[var(--radius-lg)] border-[0.5px] border-border-subtle bg-glass shadow-[var(--shadow-panel-lift)] backdrop-blur-[20px]">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ChatErrorDisplay />
          <div className="flex items-center justify-between border-b-[0.5px] border-border-subtle px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-accent-text">
              Room Chat
            </span>
            <button
              type="button"
              onClick={() => setConversationsOpen(true)}
              className="rounded-sm px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-150 hover:text-kombats-gold"
            >
              Messages
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel hideHeader />
          </div>
        </section>

        <aside
          aria-hidden={false}
          className="hidden w-[280px] shrink-0 flex-col overflow-hidden border-l-[0.5px] border-border-subtle md:flex"
        >
          <OnlinePlayersList
            onSendMessage={openDm}
            onViewProfile={setProfilePlayerId}
          />
        </aside>
      </div>

      <Sheet
        open={conversationsOpen}
        onClose={() => setConversationsOpen(false)}
        title="Messages"
      >
        <ConversationList onSelectConversation={openDm} />
      </Sheet>

      <Sheet open={!!activeDm} onClose={() => setActiveDm(null)}>
        {activeDm && (
          <DirectMessagePanel
            otherPlayerId={activeDm.otherPlayerId}
            displayName={activeDm.displayName}
            onViewProfile={setProfilePlayerId}
            onBack={() => setActiveDm(null)}
          />
        )}
      </Sheet>

      {profilePlayerId && (
        <PlayerCard
          playerId={profilePlayerId}
          open={!!profilePlayerId}
          onClose={() => setProfilePlayerId(null)}
        />
      )}
    </div>
  );
}
