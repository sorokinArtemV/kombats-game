import { useState, useCallback, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import { chatHubManager } from '@/app/transport-init';
import { useChatRateLimitState } from '../hooks';
import { useChatStore } from '../store';

const MAX_MESSAGE_LENGTH = 500;

interface MessageInputProps {
  mode?: 'global' | 'direct';
  recipientPlayerId?: string;
  onMessageSent?: () => void;
  className?: string;
}

export function MessageInput({
  mode = 'global',
  recipientPlayerId,
  onMessageSent,
  className,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const rateLimitState = useChatRateLimitState();
  const connectionState = useChatStore((s) => s.connectionState);

  const canSend =
    content.trim().length > 0 &&
    content.length <= MAX_MESSAGE_LENGTH &&
    !sending &&
    !rateLimitState.isLimited &&
    connectionState === 'connected';

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || sending) return;

    setSending(true);
    try {
      if (mode === 'direct' && recipientPlayerId) {
        await chatHubManager.sendDirectMessage(recipientPlayerId, trimmed);
      } else {
        await chatHubManager.sendGlobalMessage(trimmed);
      }
      setContent('');
      // Clear any stale message-level error on successful send
      const current = useChatStore.getState();
      if (current.lastError && current.lastError.code !== 'rate_limited') {
        useChatStore.setState({ lastError: null });
      }
      onMessageSent?.();
    } catch {
      // Error will come through ChatError event
    } finally {
      setSending(false);
    }
  }, [content, sending, mode, recipientPlayerId, onMessageSent]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) {
          handleSend();
        }
      }
    },
    [canSend, handleSend],
  );

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <div className="flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            rateLimitState.isLimited
              ? 'Slow down...'
              : connectionState !== 'connected'
                ? 'Chat disconnected'
                : 'Type a message...'
          }
          disabled={connectionState !== 'connected' || rateLimitState.isLimited}
          rows={1}
          className="flex-1 resize-none rounded-md border border-bg-surface bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent"
        >
          Send
        </button>
      </div>
      <div className="flex justify-between text-xs">
        {rateLimitState.isLimited ? (
          <span className="text-warning">Rate limited — wait a moment</span>
        ) : (
          <span />
        )}
        <span
          className={clsx(
            content.length > MAX_MESSAGE_LENGTH ? 'text-error' : 'text-text-muted',
          )}
        >
          {content.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
    </div>
  );
}
