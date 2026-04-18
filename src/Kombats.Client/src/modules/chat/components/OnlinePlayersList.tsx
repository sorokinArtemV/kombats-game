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
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-text-primary">
          Online Players
        </span>
        <span className="text-xs text-text-muted">{onlineCount}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {playerList.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-text-muted">
            No players online
          </p>
        ) : (
          <ul className="flex flex-col">
            {playerList.map((player) => (
              <PlayerRow
                key={player.playerId}
                player={player}
                onViewProfile={onViewProfile}
                onSendMessage={onSendMessage}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Row is two sibling buttons inside a non-interactive container. Previously
// the DM action was a `role="button"` span nested inside the row's parent
// `<button>` — invalid HTML (interactive inside interactive) and a React
// DOM warning. Splitting them flat-hierarchy resolves both.
function PlayerRow({
  player,
  onViewProfile,
  onSendMessage,
}: {
  player: OnlinePlayerResponse;
  onViewProfile?: (playerId: string) => void;
  onSendMessage?: (playerId: string, displayName: string) => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-bg-surface">
      <button
        type="button"
        onClick={() => onViewProfile?.(player.playerId)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="relative">
          <Avatar name={player.displayName} size="md" />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary bg-success"
            aria-hidden
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-text-primary">
            {player.displayName}
          </span>
          <span className="truncate text-xs text-text-muted">Online</span>
        </div>
      </button>
      {onSendMessage && (
        <button
          type="button"
          onClick={() => onSendMessage(player.playerId, player.displayName)}
          title="Send message"
          aria-label={`Send message to ${player.displayName}`}
          className="hidden rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-bg-elevated group-hover:inline-flex"
        >
          DM
        </button>
      )}
    </li>
  );
}
