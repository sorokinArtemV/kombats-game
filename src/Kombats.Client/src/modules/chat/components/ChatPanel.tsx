import { useRef, useEffect } from 'react';
import { useGlobalMessages, useChatConnectionState } from '../hooks';
import { ConnectionIndicator } from '@/ui/components/ConnectionIndicator';
import { MessageInput } from './MessageInput';
import { formatTimestamp } from '../format';

interface ChatPanelProps {
  hideHeader?: boolean;
}

export function ChatPanel({ hideHeader = false }: ChatPanelProps = {}) {
  const messages = useGlobalMessages();
  const connectionState = useChatConnectionState();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <div className="flex items-center justify-between border-b-[0.5px] border-border-subtle px-4 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-text">
            Room Chat
          </span>
          <ConnectionIndicator state={connectionState} />
        </div>
      )}

      <div className="kombats-scroll flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-center text-[11px] uppercase tracking-[0.18em] text-text-muted">
            No messages yet
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg) => (
              <div key={msg.messageId} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-accent-text">
                    {msg.sender.displayName}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {formatTimestamp(msg.sentAt)}
                  </span>
                </div>
                <p className="break-words pl-2 text-sm text-text-secondary">
                  {msg.content}
                </p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t-[0.5px] border-border-subtle px-3 py-2">
        <MessageInput />
      </div>
    </div>
  );
}
