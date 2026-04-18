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
    <div className="flex h-full min-h-0 gap-3 px-3 pb-3">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-secondary">
        <ChatErrorDisplay />
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-text-primary">Room Chat</span>
          <button
            type="button"
            onClick={() => setConversationsOpen(true)}
            className="rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
          >
            Messages
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel hideHeader />
        </div>
      </section>

      <aside className="hidden w-[320px] shrink-0 overflow-hidden rounded-md border border-border bg-bg-secondary md:flex md:flex-col">
        <OnlinePlayersList
          onSendMessage={openDm}
          onViewProfile={setProfilePlayerId}
        />
      </aside>

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
