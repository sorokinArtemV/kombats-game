import { useChatStore } from '../store';

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

  if (!lastError || lastError.code === 'rate_limited') return null;

  const message = ERROR_MESSAGES[lastError.code] ?? lastError.message;

  return (
    <div className="flex items-center justify-between border-b border-error/30 bg-error/10 px-3 py-1.5">
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
