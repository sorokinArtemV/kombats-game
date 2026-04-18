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
  // Dedicated silent-renew endpoint. main.tsx short-circuits on this path and
  // calls `signinSilentCallback()` instead of rendering the app. Used both for
  // token renewal AND for SSO session restore on page refresh — since tokens
  // live in memory (DEC-6), we recover the session via Keycloak's SSO cookie.
  silent_redirect_uri: `${window.location.origin}/silent-renew`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  // Hard cap on the iframe-based silent flow so a blocked iframe or
  // unreachable IdP cannot leave signinSilent() pending forever. The library
  // default is 10s; make it explicit to guarantee the promise settles and
  // the bootstrap finalizer always runs.
  silentRequestTimeoutInSeconds: 10,
  userStore: new WebStorageStateStore({ store: inMemoryStorage }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
});
