import { useMemo } from 'react';
import { useOnlinePlayers, useOnlineCount } from '../hooks';
import { useAuthStore } from '@/modules/auth/store';
import { getNickColor } from '../nick-color';
import type { OnlinePlayerResponse } from '@/types/chat';

interface OnlinePlayersListProps {
  onSendMessage?: (playerId: string, displayName: string) => void;
  onViewProfile?: (playerId: string) => void;
}

export function OnlinePlayersList({ onSendMessage, onViewProfile }: OnlinePlayersListProps) {
  const onlinePlayers = useOnlinePlayers();
  const onlineCount = useOnlineCount();
  const currentIdentityId = useAuthStore((s) => s.userIdentityId);

  const playerList = useMemo<OnlinePlayerResponse[]>(
    () => Array.from(onlinePlayers.values()),
    [onlinePlayers],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b-[0.5px] border-border-subtle px-4 py-2">
        <UsersIcon />
        <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
          Players in Chat
        </span>
        <span className="text-[11px] font-medium text-text-secondary tabular-nums">
          {onlineCount}
        </span>
      </div>

      <div className="kombats-scroll flex-1 overflow-y-auto py-1">
        {playerList.length === 0 ? (
          <p className="px-4 py-4 text-center text-[11px] uppercase tracking-[0.18em] text-text-muted">
            No players online
          </p>
        ) : (
          <ul className="flex flex-col px-2">
            {playerList.map((player) => {
              const isSelf =
                currentIdentityId !== null &&
                player.playerId.toLowerCase() === currentIdentityId.toLowerCase();
              return (
                <PlayerRow
                  key={player.playerId}
                  player={player}
                  isSelf={isSelf}
                  onViewProfile={onViewProfile}
                  onSendMessage={onSendMessage}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  isSelf,
  onViewProfile,
  onSendMessage,
}: {
  player: OnlinePlayerResponse;
  isSelf: boolean;
  onViewProfile?: (playerId: string) => void;
  onSendMessage?: (playerId: string, displayName: string) => void;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors duration-150 hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => onViewProfile?.(player.playerId)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-kombats-jade"
          style={{ boxShadow: '0 0 6px var(--color-kombats-jade)' }}
        />
        <span
          className="truncate text-xs"
          style={{ color: getNickColor(player.playerId) }}
        >
          {player.displayName}
        </span>
      </button>
      {onSendMessage && !isSelf && (
        <button
          type="button"
          onClick={() => onSendMessage(player.playerId, player.displayName)}
          title="Send message"
          aria-label={`Send message to ${player.displayName}`}
          className="hidden rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-accent-text transition-colors duration-150 hover:text-kombats-gold group-hover:inline-flex"
        >
          DM
        </button>
      )}
    </li>
  );
}

function UsersIcon() {
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
      className="text-kombats-gold"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
