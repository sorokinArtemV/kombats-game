import { useState } from 'react';
import { useChatStore } from '../store';
import { reconnectChat } from '../hooks';

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Too many messages. Please wait.',
  message_too_long: 'Message exceeds the character limit.',
  message_empty: 'Message cannot be empty.',
  recipient_not_found: 'Recipient not found.',
  not_eligible: 'Complete onboarding to use chat.',
  service_unavailable: 'Chat is temporarily unavailable.',
};

export function ChatErrorDisplay() {
  const lastError = useChatStore((s) => s.lastError);
  const connectionState = useChatStore((s) => s.connectionState);
  const [reconnecting, setReconnecting] = useState(false);

  // Terminal disconnect takes precedence — the user is effectively offline and
  // error toasts will not clear by themselves. Offer an explicit retry.
  if (connectionState === 'failed') {
    const handleRetry = async () => {
      setReconnecting(true);
      try {
        await reconnectChat();
      } finally {
        setReconnecting(false);
      }
    };

    return (
      <div
        className="flex items-center justify-between border-b border-error/30 bg-error/10 px-3 py-1.5"
        role="alert"
      >
        <p className="text-xs text-error">
          Chat disconnected. Automatic reconnect exhausted.
        </p>
        <button
          onClick={handleRetry}
          disabled={reconnecting}
          className="ml-2 rounded-md border border-error/40 px-2 py-0.5 text-xs text-error transition-colors hover:bg-error/10 disabled:opacity-50"
        >
          {reconnecting ? 'Reconnecting…' : 'Reconnect'}
        </button>
      </div>
    );
  }

  if (!lastError || lastError.code === 'rate_limited') return null;

  const message = ERROR_MESSAGES[lastError.code] ?? lastError.message;

  return (
    <div
      className="flex items-center justify-between border-b border-error/30 bg-error/10 px-3 py-1.5"
      role="alert"
    >
      <p className="text-xs text-error">{message}</p>
      <button
        onClick={() => useChatStore.setState({ lastError: null })}
        className="ml-2 text-xs text-error/60 transition-colors hover:text-error"
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  );
}
