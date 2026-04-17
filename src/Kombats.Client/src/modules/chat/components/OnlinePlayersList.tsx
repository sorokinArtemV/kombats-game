import { useMemo } from 'react';
import { useOnlinePlayers, useOnlineCount } from '../hooks';
import { Avatar } from '@/ui/components/Avatar';
import type { OnlinePlayerResponse } from '@/types/chat';

interface OnlinePlayersListProps {
  onSendMessage?: (playerId: string, displayName: string) => void;
  onViewProfile?: (playerId: string) => void;
}

export function OnlinePlayersList({ onSendMessage, onViewProfile }: OnlinePlayersListProps) {
  const onlinePlayers = useOnlinePlayers();
  const onlineCount = useOnlineCount();

  const playerList = useMemo<OnlinePlayerResponse[]>(
    () => Array.from(onlinePlayers.values()),
    [onlinePlayers],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-bg-surface px-3 py-2">
        <span className="text-sm font-medium text-text-primary">Online Players</span>
        <span className="text-xs text-text-muted">{onlineCount}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {playerList.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs text-text-muted">No players online</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {playerList.map((player) => (
              <li
                key={player.playerId}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-surface"
              >
                <Avatar name={player.displayName} size="sm" />
                <span className="flex-1 truncate text-sm text-text-primary">
                  {player.displayName}
                </span>
                <div className="hidden gap-1 group-hover:flex">
                  {onViewProfile && (
                    <button
                      onClick={() => onViewProfile(player.playerId)}
                      className="rounded px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-bg-primary hover:text-text-primary"
                      title="View profile"
                    >
                      Profile
                    </button>
                  )}
                  {onSendMessage && (
                    <button
                      onClick={() => onSendMessage(player.playerId, player.displayName)}
                      className="rounded px-1.5 py-0.5 text-xs text-accent transition-colors hover:bg-bg-primary"
                      title="Send message"
                    >
                      DM
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
