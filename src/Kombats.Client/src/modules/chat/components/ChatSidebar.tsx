import { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { ConversationList } from './ConversationList';
import { DirectMessagePanel } from './DirectMessagePanel';
import { OnlinePlayersList } from './OnlinePlayersList';
import { ChatErrorDisplay } from './ChatErrorDisplay';
import { PlayerCard } from '@/modules/player/components/PlayerCard';
import { clsx } from 'clsx';

type SidebarTab = 'chat' | 'messages' | 'players';

interface ActiveDm {
  otherPlayerId: string;
  displayName: string;
}

export function ChatSidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const [activeDm, setActiveDm] = useState<ActiveDm | null>(null);
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);

  const handleOpenDm = (otherPlayerId: string, displayName: string) => {
    setActiveDm({ otherPlayerId, displayName });
    setActiveTab('messages');
  };

  const handleCloseDm = () => {
    setActiveDm(null);
  };

  const handleViewProfile = (playerId: string) => {
    setProfilePlayerId(playerId);
  };

  return (
    <div className="flex h-full flex-col">
      <ChatErrorDisplay />

      {/* Tab bar */}
      <div className="flex border-b border-bg-surface">
        <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>
          Global
        </TabButton>
        <TabButton active={activeTab === 'messages'} onClick={() => setActiveTab('messages')}>
          Messages
        </TabButton>
        <TabButton active={activeTab === 'players'} onClick={() => setActiveTab('players')}>
          Players
        </TabButton>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'messages' && (
          activeDm ? (
            <DirectMessagePanel
              otherPlayerId={activeDm.otherPlayerId}
              displayName={activeDm.displayName}
              onViewProfile={handleViewProfile}
              onBack={handleCloseDm}
            />
          ) : (
            <ConversationList onSelectConversation={handleOpenDm} />
          )
        )}
        {activeTab === 'players' && (
          <OnlinePlayersList
            onSendMessage={handleOpenDm}
            onViewProfile={handleViewProfile}
          />
        )}
      </div>

      {/* Player card overlay */}
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 px-2 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-b-2 border-accent text-accent'
          : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {children}
    </button>
  );
}
