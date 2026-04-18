import { UserManager, InMemoryWebStorage, WebStorageStateStore } from 'oidc-client-ts';
import { config } from '@/config';

// userStore/stateStore require the StateStore interface (set/get/remove/getAllKeys).
// InMemoryWebStorage implements the DOM Storage interface (setItem/getItem/removeItem),
// so it must be passed *inside* a WebStorageStateStore, never used directly as
// userStore. DEC-6 (tokens in memory, never localStorage) is preserved by backing
// the userStore with InMemoryWebStorage.
const inMemoryStorage = new InMemoryWebStorage();

export const userManager = new UserManager({
  authority: config.keycloak.authority,
  client_id: config.keycloak.clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  userStore: new WebStorageStateStore({ store: inMemoryStorage }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
});
