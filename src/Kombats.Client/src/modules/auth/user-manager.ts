import { UserManager, InMemoryWebStorage, WebStorageStateStore } from 'oidc-client-ts';
import { config } from '@/config';

export const userManager = new UserManager({
  authority: config.keycloak.authority,
  client_id: config.keycloak.clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  userStore: new InMemoryWebStorage(),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
});
