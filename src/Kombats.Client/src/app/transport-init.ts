import { useAuthStore } from '@/modules/auth/store';
import { configureHttpClient } from '@/transport/http/client';
import { BattleHubManager } from '@/transport/signalr/battle-hub';
import { ChatHubManager } from '@/transport/signalr/chat-hub';

function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

function accessTokenFactory(): string {
  return getAccessToken() ?? '';
}

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

function onAuthFailure(): void {
  // eslint-disable-next-line no-console
  console.log(`${DIAG} transport-init onAuthFailure -> clearAuth`, {
    pathname: window.location.pathname,
    reason: 'HTTP 401 from BFF',
  });
  useAuthStore.getState().clearAuth();
}

// Wire HTTP client
configureHttpClient({ getAccessToken, onAuthFailure });

// Create SignalR manager singletons with injected token factory
export const battleHubManager = new BattleHubManager(accessTokenFactory);
export const chatHubManager = new ChatHubManager(accessTokenFactory);
