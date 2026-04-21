# Kombats Keycloak Web Client Integration

## 1. Purpose and scope

This document specifies how the Kombats React/Vite SPA integrates with Keycloak for authentication, registration, and token lifecycle management. It is implementation-oriented -- not a generic OIDC tutorial.

**Inputs:**
- `04-frontend-client-architecture.md` -- architecture decisions (DEC-6 token storage, auth module design, SignalR auth)
- `01-backend-revision-for-frontend.md` -- BFF auth expectations (Section 4)
- `infra/keycloak/kombats-realm.json` -- current realm configuration
- `src/Kombats.Bff/Kombats.Bff.Bootstrap/Program.cs` -- BFF JWT validation setup

**Audience:** Frontend implementers and DevOps (for realm/client configuration validation).

**Scope:** Login, registration, token lifecycle, SignalR auth, and environment configuration. Does not cover Keycloak admin operations, user management, or role-based access control (Kombats has no RBAC beyond "authenticated user").

---

## 2. Auth flow: Authorization Code with PKCE

The Kombats SPA uses **Authorization Code Flow with Proof Key for Code Exchange (PKCE)**.

### Why this flow

| Alternative | Why not |
|---|---|
| Implicit flow | Deprecated by OAuth 2.1. Tokens in URL fragment are exposed in browser history and server logs. Keycloak realm already has `implicitFlowEnabled: false`. |
| Client Credentials | For machine-to-machine. A browser SPA has no way to securely hold a client secret. |
| Resource Owner Password Credentials (ROPC) | Requires the SPA to collect and transmit the user's password directly. Breaks the security model (SPA should never see the password). `directAccessGrantsEnabled: false` is set on `kombats-web`. |
| Authorization Code without PKCE | Vulnerable to authorization code interception in public clients. PKCE is mandatory for SPAs per OAuth 2.1 / RFC 7636. |

**Authorization Code + PKCE** is the only correct choice for a browser-based SPA. The SPA is a public client (no client secret). PKCE protects the authorization code exchange without requiring a secret.

### Flow sequence

```
1. User clicks Login (or Register)
   |
2. Frontend generates a random code_verifier and derives code_challenge (S256)
   |
3. Frontend redirects browser to Keycloak authorization endpoint:
   GET {authority}/protocol/openid-connect/auth
     ?client_id=kombats-web
     &response_type=code
     &redirect_uri=http://localhost:5173/auth/callback
     &scope=openid profile email
     &code_challenge={code_challenge}
     &code_challenge_method=S256
     &state={random_state}
     &nonce={random_nonce}
   (For registration: append &kc_action=register or use the registration URL)
   |
4. Keycloak shows login page (or registration page)
   |
5. User authenticates (or registers then authenticates)
   |
6. Keycloak redirects back to:
   http://localhost:5173/auth/callback?code={authorization_code}&state={state}
   |
7. Frontend's callback handler exchanges the code for tokens:
   POST {authority}/protocol/openid-connect/token
     client_id=kombats-web
     &grant_type=authorization_code
     &code={authorization_code}
     &redirect_uri=http://localhost:5173/auth/callback
     &code_verifier={code_verifier}
   |
8. Keycloak returns:
   { access_token, refresh_token, id_token, expires_in, ... }
   |
9. Frontend stores tokens in memory, redirects to app root
```

All of this is handled by `oidc-client-ts` and `react-oidc-context`. The frontend does not implement the PKCE mechanics manually.

---

## 3. Keycloak client configuration

### 3.1 Current state

The realm (`infra/keycloak/kombats-realm.json`) contains a dedicated `kombats-web` client configured for the SPA. This client uses Authorization Code + PKCE, is a public client, and has the `kombats-api` audience mapper required by the BFF.

The `account` client also exists but is restored to its standard Keycloak role (user self-service account management). It no longer carries SPA-specific redirect URIs or the audience mapper -- those belong exclusively to `kombats-web`.

### 3.2 Client settings (as configured in realm JSON)

| Setting | Value | Reason |
|---|---|---|
| Client ID | `kombats-web` | Descriptive, distinct from backend services and Keycloak built-in clients |
| Client type | Public (`publicClient: true`) | SPA cannot hold a client secret |
| Standard Flow Enabled | `true` | Authorization Code flow |
| Implicit Flow Enabled | `false` | Deprecated, not needed |
| Direct Access Grants Enabled | `false` | ROPC disabled -- SPA must not collect passwords directly |
| Service Accounts Enabled | `false` | Not a backend service |
| Client Authentication | Off | Public client |
| Root URL | `http://localhost:5173` (dev) | Vite default dev server port |
| Valid Redirect URIs | `http://localhost:5173/*`, `http://localhost:5000/*`, `http://localhost:3000/*` (dev) | SPA callback; multiple dev ports for flexibility |
| Valid Post Logout Redirect URIs | `http://localhost:5173/*`, `http://localhost:5000/*`, `http://localhost:3000/*` (dev) | Where to go after Keycloak logout. Must cover every dev port the SPA may actually run on — Vite defaults to 5173 but the Kombats `vite.config.ts` overrides it to 3000. A missing port here causes Keycloak to reject the post-logout redirect with "Invalid parameter" after sign-out. |
| Web Origins | `http://localhost:5173`, `http://localhost:5000`, `http://localhost:3000` (dev) | CORS for token endpoint requests from each dev port |
| PKCE Code Challenge Method | `S256` | Enforced via `pkce.code.challenge.method` attribute |
| Front-channel Logout | `false` | Not needed for SPA |
| Consent Required | `false` | First-party app, no consent screen |
| Full Scope Allowed | `true` | All realm scopes available to this client |

### 3.3 Redirect URIs

**Development (as configured in realm JSON):**
```
Valid Redirect URIs:     http://localhost:5173/*
                         http://localhost:5000/*
                         http://localhost:3000/*
Post Logout Redirect:    http://localhost:5173/*
                         http://localhost:5000/*
                         http://localhost:3000/*
```

Multiple dev ports are registered for flexibility: `5173` is Vite's default, `5000` and `3000` are common alternatives. The Kombats SPA currently runs on `3000` (`src/Kombats.Client/vite.config.ts`). The same three ports are registered as Valid Redirect URIs *and* as Post Logout Redirect URIs — if a port is missing from the post-logout list, Keycloak rejects the logout redirect with "Invalid parameter: redirect_uri" and the user lands on a Keycloak error page instead of the SPA guest landing.

**Production (must be added per environment -- not in dev realm JSON):**
```
Valid Redirect URIs:     https://kombats.example.com/*
Post Logout Redirect:    https://kombats.example.com/*
```

The wildcard after the origin is necessary because the callback path is `/auth/callback` and the post-logout path may be `/`. Keycloak matches redirect URIs against the registered patterns.

**Do not use `*` as a standalone redirect URI.** This allows open redirects and is a security vulnerability.

### 3.4 Web Origins / CORS

The Web Origins setting controls which origins Keycloak includes in CORS response headers for the token endpoint (used during code exchange and token refresh).

| Environment | Web Origins |
|---|---|
| Development (as configured) | `http://localhost:5173`, `http://localhost:5000`, `http://localhost:3000` |
| Production (must be added) | `https://kombats.example.com` |

The `+` value (meaning "all registered redirect URI origins") is also acceptable and simpler to maintain. The `kombats-web` client uses explicit origins rather than `+` to avoid ambiguity about what is allowed.

### 3.5 Audience mapper

The BFF validates that the JWT's `aud` claim includes `kombats-api`. The client must include a protocol mapper that adds this audience to access tokens.

```json
{
  "name": "kombats-api-audience",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-audience-mapper",
  "consentRequired": false,
  "config": {
    "included.custom.audience": "kombats-api",
    "id.token.claim": "false",
    "access.token.claim": "true"
  }
}
```

This mapper is configured on the `kombats-web` client in the realm JSON. It was previously on the `account` client (which was serving as the SPA client) and has been moved to `kombats-web` as part of the client separation.

**Without this mapper, all BFF requests will fail with 401** because the access token will not contain the expected `aud: "kombats-api"` claim.

### 3.6 Token settings

| Setting | Current value | Notes |
|---|---|---|
| Access Token Lifespan | 3600s (1 hour) | Reasonable for MVP. Shorter (5-15 min) is more secure for production but increases refresh frequency. |
| SSO Session Idle Timeout | 36000s (10 hours) | How long a refresh token remains valid without activity. Generous for a game -- players may leave and return. |
| SSO Session Max Lifespan | 36000s (10 hours) | Absolute session limit. After this, re-login required. |
| Signature Algorithm | RS256 | Standard. BFF validates with Keycloak's public key. |

These are realm-level settings. The frontend does not configure them but must be aware of their values to set up renewal timing correctly.

### 3.7 Required scopes

| Scope | Purpose |
|---|---|
| `openid` | Required for OIDC. Returns `sub` claim (user identity ID). |
| `profile` | Returns `preferred_username` claim (used as display name by BFF). |
| `email` | Returns `email` claim (not currently used by BFF, but standard inclusion). |

The frontend requests `scope=openid profile email` in the authorization request. These are default scopes in the current realm configuration.

---

## 4. Registration flow

### 4.1 Realm requirements for hosted registration

The following realm settings must be enabled:

| Setting | Required value | Current status |
|---|---|---|
| `registrationAllowed` | `true` | Already enabled |
| `verifyEmail` | `false` for immediate auth return; `true` for email verification | Currently `false` |
| `registrationEmailAsUsername` | `false` (username is separate from email) | Already `false` |
| `editUsernameAllowed` | `false` (username is permanent) | Already `false` |

### 4.2 How to trigger registration

Keycloak exposes a registration URL that is a variation of the authorization URL. Two approaches:

**Approach A: `kc_action=register` parameter (Keycloak 24+)**
```
GET {authority}/protocol/openid-connect/auth
  ?client_id=kombats-web
  &response_type=code
  &redirect_uri={callback_url}
  &scope=openid profile email
  &code_challenge={...}
  &code_challenge_method=S256
  &kc_action=register
```

This shows the registration form directly instead of the login form.

**Approach B: Direct registration URL**
```
GET {keycloak_base}/realms/kombats/protocol/openid-connect/registrations
  ?client_id=kombats-web
  &response_type=code
  &redirect_uri={callback_url}
  &scope=openid profile email
```

Both work. Approach A is cleaner with `oidc-client-ts` because it uses the standard authorization endpoint with an extra parameter.

**Implementation with `oidc-client-ts`:**

`oidc-client-ts` supports extra authorization parameters. The frontend's "Register" button calls `signinRedirect` with the additional `kc_action` parameter:

```typescript
// Login -- standard redirect
userManager.signinRedirect();

// Register -- same redirect, different Keycloak behavior
userManager.signinRedirect({ extraQueryParams: { kc_action: "register" } });
```

Both flows return to the same `/auth/callback` endpoint. The callback handler does not need to distinguish between login and registration -- the result is the same (an authorization code to exchange for tokens).

### 4.3 Post-registration behavior

**Path 1: Registration returns authenticated immediately (current configuration)**

When `verifyEmail: false`, Keycloak creates the account and immediately authenticates the user. The redirect to `/auth/callback` includes an authorization code. The callback handler exchanges it for tokens normally. The user enters the app authenticated.

This is the current Kombats realm configuration and the expected default path.

**Path 2: Realm requires email verification or separate login after registration**

If `verifyEmail: true` or other post-registration actions are configured, Keycloak may:
- Show an "email verification sent" page after registration (no redirect to callback)
- Redirect to the login page after registration (user must log in manually)

In either case, no authorization code reaches the callback URL after registration.

**How the frontend handles both paths:**

The callback handler (`/auth/callback`) only activates when Keycloak redirects back with a `code` parameter. If the user returns to the app without a code (e.g., navigates back manually after seeing a verification page), the app detects no authenticated session and shows the unauthenticated landing with Login/Register options.

No special branching logic is needed. The callback route handles success; the absence of a callback means the user must authenticate via Login.

---

## 5. Login flow

### 5.1 Browser redirect

```
1. User clicks "Login" on the unauthenticated landing screen
2. Frontend calls userManager.signinRedirect()
   - oidc-client-ts generates PKCE code_verifier + code_challenge
   - Stores code_verifier, state, nonce in sessionStorage (oidc-client-ts internal, not app-controlled)
   - Redirects browser to Keycloak authorization endpoint
3. User sees Keycloak login page
4. User enters credentials and submits
5. Keycloak validates, creates session, redirects to:
   http://localhost:5173/auth/callback?code=<code>&state=<state>&session_state=<...>
```

### 5.2 Callback handling

The `/auth/callback` route renders a component that:

```
1. Calls userManager.signinCallback() (or uses react-oidc-context's automatic callback handling)
2. oidc-client-ts:
   a. Reads the authorization code from the URL
   b. Reads the stored code_verifier from sessionStorage
   c. POSTs to Keycloak token endpoint (code exchange with PKCE)
   d. Receives { access_token, refresh_token, id_token, expires_in }
   e. Validates the id_token (nonce, issuer, audience)
   f. Clears PKCE state from sessionStorage
   g. Fires "userLoaded" event with the User object
3. Frontend auth store updates with the authenticated user
4. Frontend navigates to "/" (which triggers GameStateLoader -> startup resolution)
```

**Error cases on callback:**
- Missing `code` parameter -> redirect to landing (user returned without completing auth)
- Code exchange fails (expired code, PKCE mismatch) -> redirect to landing, show error toast
- Network error reaching token endpoint -> show connectivity error, offer retry

### 5.3 Token acquisition result

After successful callback, `oidc-client-ts` provides a `User` object containing:

| Field | Use |
|---|---|
| `access_token` | Bearer token for BFF HTTP requests; `access_token` query param for SignalR |
| `refresh_token` | Used by `oidc-client-ts` for silent renewal |
| `id_token` | Contains identity claims (`sub`, `preferred_username`, `email`) |
| `expires_at` | Unix timestamp when the access token expires |
| `profile.sub` | User's Keycloak ID (identity ID used throughout Kombats) |
| `profile.preferred_username` | Display name |

---

## 6. Token lifecycle

### 6.1 Access token usage

The access token is attached to every outbound request:

| Transport | How |
|---|---|
| HTTP requests to BFF | `Authorization: Bearer <access_token>` header |
| SignalR `/battlehub` | `?access_token=<access_token>` query parameter on connection URL |
| SignalR `/chathub` | `?access_token=<access_token>` query parameter on connection URL |

The token is read from the `oidc-client-ts` User object (or the auth Zustand store, which mirrors it).

### 6.2 Silent renewal strategy

`oidc-client-ts` supports automatic silent token renewal. The strategy:

```
1. oidc-client-ts monitors access token expiry (from expires_at)
2. Before expiry (configurable, default 60 seconds before), it triggers renewal
3. Renewal uses the refresh_token to obtain a new access_token:
   POST {authority}/protocol/openid-connect/token
     client_id=kombats-web
     &grant_type=refresh_token
     &refresh_token={refresh_token}
4. On success: new access_token, refresh_token, expires_at stored in memory
5. "userLoaded" event fires with updated User
6. Auth store updates with the new token
```

**Configuration for `oidc-client-ts` UserManager:**

```typescript
const userManagerSettings: UserManagerSettings = {
  authority: config.keycloakAuthority,    // e.g., "http://localhost:8080/realms/kombats"
  client_id: "kombats-web",
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: "code",
  scope: "openid profile email",
  automaticSilentRenew: true,
  // Trigger renewal 60 seconds before expiry.
  // With a 3600s access token, renewal happens at ~3540s.
  accessTokenExpiringNotificationTimeInSeconds: 60,
  // Silent renewal uses refresh_token, not iframe-based silent auth.
  // No silent_redirect_uri needed.
};
```

**Why refresh_token renewal, not iframe-based silent auth:**

`oidc-client-ts` supports two renewal methods:
1. **Silent redirect (iframe):** Opens a hidden iframe to Keycloak's authorization endpoint with `prompt=none`. Relies on Keycloak's SSO cookie. Breaks when third-party cookies are blocked (Safari, Firefox, Chrome with Privacy Sandbox). Increasingly unreliable.
2. **Refresh token:** Direct HTTP POST to the token endpoint. No cookies, no iframes, no third-party cookie dependency. Works in all browsers.

Kombats uses **refresh_token renewal**. It is simpler and more reliable.

### 6.3 What happens on refresh failure

Refresh fails when:
- The refresh token has expired (SSO session idle timeout: 10 hours)
- The refresh token has been revoked (admin action, password change)
- Keycloak is unreachable

**Handling:**

```
1. oidc-client-ts fires "silentRenewError" event
2. Frontend auth store transitions to "expired" state
3. All subsequent BFF requests will return 401 (stale access token)
4. The 401 interceptor in the HTTP client:
   a. Clears auth state
   b. Navigates to unauthenticated landing
   c. Shows "Session expired, please log in again"
5. Active SignalR connections will eventually fail (next hub invocation rejected)
   - BattleHubManager and ChatHubManager detect auth failure and stop reconnecting
```

**Edge case: refresh fails during active battle.**

The access token has a 1-hour lifespan. A single battle (with a typical turn duration) lasts minutes, not hours. Token expiry during battle is unlikely. If it does happen:
- The SignalR connection was established with a valid token and will continue to work for the duration of the connection (the token was validated at connection time, not per-message).
- If the connection drops and must reconnect, the `accessTokenFactory` will return the stale token, and the reconnect will fail with 401. The battle state machine transitions to `Error`.
- The player is returned to the login screen. After re-login, startup recovery (REQ-S1 -> REQ-S2) reconnects them to the battle if it is still active.

---

## 7. SignalR auth integration

### 7.1 Token delivery

Both SignalR hubs expect the JWT as a query parameter, not a header. This is because WebSocket connections cannot set custom headers in the browser -- the token must be in the URL.

**Connection setup (battle hub):**

```typescript
const connection = new HubConnectionBuilder()
  .withUrl(`${bffBaseUrl}/battlehub`, {
    accessTokenFactory: () => authStore.getState().accessToken,
  })
  .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])
  .build();
```

**Connection setup (chat hub):**

```typescript
const connection = new HubConnectionBuilder()
  .withUrl(`${bffBaseUrl}/chathub`, {
    accessTokenFactory: () => authStore.getState().accessToken,
  })
  .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])
  .build();
```

The `@microsoft/signalr` library calls `accessTokenFactory` on each connection attempt (initial connect and every reconnect). It appends the returned token as `?access_token=<token>` to the WebSocket negotiation URL.

### 7.2 How BFF processes the token

The BFF's `OnMessageReceived` event handler in `Program.cs` extracts the token from the `access_token` query parameter when the request path starts with `/battlehub` or `/chathub`. It assigns it to `context.Token`, which the JWT Bearer middleware then validates normally.

After authentication, the BFF's hub methods (`BattleHub`, `ChatHub`) extract the token again via `GetAccessToken()` to forward it to the downstream service hubs (Battle, Chat). The downstream services independently validate the same JWT.

### 7.3 Token refresh and active connections

**Key fact:** SignalR validates the JWT at connection establishment time only. Once the WebSocket connection is open, messages flow without per-message token validation.

This means:
- A connection established with a valid token continues to work even after the token expires, as long as the WebSocket stays open.
- If the connection drops, `accessTokenFactory` is called for the reconnect attempt. This returns the current (hopefully refreshed) token from the auth store.
- If silent renewal has failed and the auth store has no valid token, the reconnect attempt will fail with 401.

**The `accessTokenFactory` callback reads the token at call time, not at setup time.** This is why it reads from `authStore.getState()` (current value) rather than capturing a token at connection creation.

### 7.4 SignalR auth failure handling

| Scenario | What happens | Frontend response |
|---|---|---|
| Connection with valid token | Normal operation | N/A |
| Connection with expired token | 401 from BFF | `accessTokenFactory` returned stale token. Attempt silent renewal, then retry. If renewal fails, transition to auth error. |
| Token expires during open connection | Connection continues working | No action needed until reconnect |
| Connection drops, renewal succeeded | `accessTokenFactory` returns new token, reconnect succeeds | Transparent to user |
| Connection drops, renewal failed | `accessTokenFactory` returns stale token, reconnect gets 401 | Auth error -> redirect to login |

---

## 8. Security considerations

### 8.1 SPA constraints

A browser SPA is a public client. It cannot securely store a client secret. All communication with Keycloak's token endpoint uses the PKCE code verifier instead of a client secret.

The access token, refresh token, and id token are accessible to any JavaScript running in the page context. This makes XSS the primary threat vector.

### 8.2 Token storage: in-memory only (DEC-6)

Per the architecture decision DEC-6, tokens are stored **in-memory only**:
- In the `oidc-client-ts` UserManager's internal state
- Mirrored in the Zustand auth store

**Not in `localStorage`.** Not in `sessionStorage` (except for temporary PKCE state during the redirect flow, managed by `oidc-client-ts` internally). Not in cookies.

**Why not `localStorage`:**
- Kombats has a chat feature that accepts user-generated text input and displays it to other users. This is a potential XSS vector. Any successful XSS can read `localStorage` and exfiltrate tokens.
- In-memory storage is cleared on page navigation. XSS that does not control navigation cannot silently exfiltrate tokens after the fact.
- The tradeoff is that a page refresh requires silent renewal (refresh token POST to Keycloak). With a ~100ms round-trip to a local or nearby Keycloak instance, this is imperceptible.

**`oidc-client-ts` storage configuration:**

```typescript
const userManagerSettings: UserManagerSettings = {
  // ...
  // Use in-memory storage for the User object (tokens).
  // WebStorageStateStore with sessionStorage is the default -- override it.
  userStore: new InMemoryWebStorage(),
  // PKCE state (code_verifier, nonce) still uses sessionStorage
  // because it must survive the redirect. This is temporary and
  // automatically cleaned up after callback.
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
};
```

`InMemoryWebStorage` is provided by `oidc-client-ts`. It stores the User object in a plain JavaScript object that is lost on page refresh.

### 8.3 Additional security measures

| Measure | Implementation |
|---|---|
| PKCE (S256) | Automatic via `oidc-client-ts`. Prevents authorization code interception. |
| State parameter | Automatic via `oidc-client-ts`. Prevents CSRF on the callback. |
| Nonce validation | Automatic via `oidc-client-ts`. Prevents id_token replay. |
| Token in URL for SignalR | Required by the WebSocket protocol. The `access_token` query parameter is logged by some reverse proxies; production proxy config should strip or mask query parameters from access logs. |
| HTTPS in production | All Keycloak and BFF communication must be HTTPS. Current `sslRequired: "none"` and `RequireHttpsMetadata = false` are for local development only. |
| No ROPC | `directAccessGrantsEnabled: false` on `kombats-web`. Already configured. The frontend never collects passwords. |
| Brute force protection | `bruteForceProtected: false` in the dev realm. Must be enabled for production to prevent credential stuffing against Keycloak's login page. |

---

## 9. Environment / configuration requirements

The frontend app needs the following configuration values at runtime:

| Config key | Example (development) | Description |
|---|---|---|
| `VITE_KEYCLOAK_AUTHORITY` | `http://localhost:8080/realms/kombats` | Keycloak realm URL. Used as `authority` in `oidc-client-ts`. OIDC discovery endpoint is `{authority}/.well-known/openid-configuration`. |
| `VITE_KEYCLOAK_CLIENT_ID` | `kombats-web` | Keycloak client ID for the SPA. |
| `VITE_BFF_BASE_URL` | `http://localhost:5200` | BFF base URL for HTTP and SignalR connections. |

These are compile-time environment variables (Vite replaces `import.meta.env.VITE_*` at build time).

**For production builds with per-environment configuration:** Inject values via a `config.js` file served alongside the SPA, or use a runtime configuration endpoint. Do not hardcode production URLs at build time if the same build artifact is deployed to multiple environments.

**Derived values (computed in code, not configured):**

| Value | Derivation |
|---|---|
| `redirect_uri` | `${window.location.origin}/auth/callback` |
| `post_logout_redirect_uri` | `${window.location.origin}/` (trailing `/` required to satisfy Keycloak's `<origin>/*` post-logout pattern) |
| Battle hub URL | `${VITE_BFF_BASE_URL}/battlehub` |
| Chat hub URL | `${VITE_BFF_BASE_URL}/chathub` |

---

## 10. Logout flow

### 10.1 Frontend-initiated logout

```
1. User clicks "Logout"
2. Frontend calls userManager.signoutRedirect()
3. oidc-client-ts redirects to Keycloak's end_session_endpoint:
   GET {authority}/protocol/openid-connect/logout
     ?client_id=kombats-web
     &id_token_hint={id_token}
     &post_logout_redirect_uri={origin}
4. Keycloak destroys the server-side session
5. Keycloak redirects to post_logout_redirect_uri (app root)
6. App loads fresh -> no token in memory -> shows unauthenticated landing
```

### 10.2 Cleanup before redirect

Before triggering the Keycloak logout redirect, the frontend should:
1. Disconnect the chat SignalR connection (clean disconnect -> presence updated)
2. Disconnect the battle SignalR connection (if active)
3. Stop the matchmaking poller (if active)
4. Clear the auth Zustand store
5. Clear all feature Zustand stores (battle, chat, matchmaking, player)
6. Clear TanStack Query cache

This prevents stale state from leaking if the logout redirect fails or the user navigates back.

---

## 11. Full `oidc-client-ts` configuration reference

This is the complete `UserManagerSettings` object for Kombats, combining all decisions from this document:

```typescript
import {
  UserManager,
  UserManagerSettings,
  InMemoryWebStorage,
  WebStorageStateStore,
} from "oidc-client-ts";

const settings: UserManagerSettings = {
  // Keycloak realm URL
  authority: import.meta.env.VITE_KEYCLOAK_AUTHORITY,

  // Public client ID (no client_secret)
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,

  // Callback route in the SPA
  redirect_uri: `${window.location.origin}/auth/callback`,

  // Where to go after Keycloak logout.
  // Trailing `/` required: Keycloak registers `<origin>/*` and the wildcard
  // matcher demands a path separator after the host.
  post_logout_redirect_uri: `${window.location.origin}/`,

  // Authorization Code flow
  response_type: "code",

  // Required scopes: sub (identity), preferred_username (display name), email
  scope: "openid profile email",

  // Silent renewal via refresh_token (not iframe)
  automaticSilentRenew: true,

  // Start renewal 60 seconds before access token expires
  accessTokenExpiringNotificationTimeInSeconds: 60,

  // Token storage: in-memory only (DEC-6 security decision)
  userStore: new InMemoryWebStorage(),

  // PKCE state storage: sessionStorage (survives the redirect, cleaned up after callback)
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),

  // Include id_token_hint in logout redirect
  includeIdTokenInSilentRenew: false,
  revokeTokensOnSignout: true,
};

export const userManager = new UserManager(settings);
```

---

## 12. Open questions / deployment validation checklist

### Already configured in dev realm JSON (verify on import)

| # | Item | Status | How to verify |
|---|---|---|---|
| 1 | **`kombats-web` client exists in the `kombats` realm** | Configured in `kombats-realm.json`. | After `docker-compose up`, Keycloak Admin Console -> Clients -> verify `kombats-web` exists. |
| 2 | **Audience mapper (`kombats-api`) on `kombats-web`** | Configured in `kombats-realm.json`. | Keycloak Admin Console -> Clients -> `kombats-web` -> Client Scopes -> verify `kombats-api-audience` mapper exists. Alternatively, decode a token and verify `aud` contains `"kombats-api"`. |
| 3 | **`registrationAllowed: true` on the realm** | Configured in `kombats-realm.json`. | Keycloak Admin Console -> Realm Settings -> Login tab -> "User registration" is ON. |
| 4 | **`directAccessGrantsEnabled: false` on `kombats-web`** | Configured in `kombats-realm.json`. | Keycloak Admin Console -> Clients -> `kombats-web` -> Settings -> "Direct access grants" is OFF. |
| 5 | **PKCE enforced (`S256`) on `kombats-web`** | Configured via `pkce.code.challenge.method` attribute in `kombats-realm.json`. | Attempt an authorization request without PKCE code_challenge -- Keycloak should reject it. |

### DevOps must confirm for each non-dev environment

| # | Item | Why it matters | How to verify |
|---|---|---|---|
| 6 | **Redirect URIs include the deployment origin** | Missing redirect URIs cause `invalid_redirect_uri` errors that completely block login. | Add `https://<domain>/*` to `kombats-web` Valid Redirect URIs for each deployed environment (staging, production). |
| 7 | **Web Origins include the deployment origin** | Missing web origins cause CORS errors on the token endpoint, silently breaking code exchange and token refresh. | Add `https://<domain>` to `kombats-web` Web Origins for each deployed environment. |
| 8 | **Post Logout Redirect URIs include the deployment origin** | Missing post-logout URIs cause Keycloak to show a generic "you have been logged out" page instead of redirecting back to the app. | Add `https://<domain>/*` to the `post.logout.redirect.uris` attribute on `kombats-web`. |
| 9 | **HTTPS enforced in production** | `sslRequired: "none"` and `RequireHttpsMetadata = false` are dev-only. | Set `sslRequired: "external"` or `"all"` on the production realm. Set BFF `RequireHttpsMetadata` to `true` (or omit it -- `true` is the default). |
| 10 | **`bruteForceProtected: true` in production** | Dev realm has `bruteForceProtected: false`. Without it, Keycloak's login page is vulnerable to credential stuffing attacks. | Keycloak Admin Console -> Realm Settings -> Security Defenses -> Brute Force Detection -> enable and configure thresholds. |
| 11 | **`verifyEmail` setting is intentional for production** | Currently `false` (immediate auth after registration). If production requires email verification, set to `true` -- the frontend handles both paths. | Keycloak Admin Console -> Realm Settings -> Login tab -> "Verify email" matches product intent. |
| 12 | **Access token lifespan is appropriate for production** | 3600s (1 hour) is fine for MVP. For production, consider shorter (300-900s) with more frequent refresh. | Keycloak Admin Console -> Realm Settings -> Tokens tab -> Access Token Lifespan. |
| 13 | **Reverse proxy does not strip `access_token` query parameter** | If a reverse proxy (nginx, Cloudflare, etc.) strips query parameters from WebSocket upgrade requests, SignalR auth breaks silently. | Test SignalR connection through the production proxy. Verify `/battlehub` and `/chathub` negotiation succeeds. |

### Open architectural questions (non-blocking)

| # | Question | Impact | Default |
|---|---|---|---|
| A1 | Should the SPA support multiple simultaneous tabs with independent sessions? | Currently each tab does its own OIDC flow. With in-memory storage, each tab holds an independent token. This works but means each tab independently refreshes. | Accept. No coordination needed for MVP. |
| A2 | Should logout in one tab log out all tabs? | With in-memory storage, logging out in one tab does not affect others. A `BroadcastChannel` could coordinate, but adds complexity. | Defer. Not MVP. Each tab manages its own session. |
| A3 | Should the frontend handle Keycloak-side session revocation (admin kicks user)? | Without backchannel logout or periodic session checks, a revoked session is only detected on the next token refresh. | Accept. Refresh failure triggers re-login (Section 6.3). Sufficient for MVP. |

---

## 13. Recommended next step

1. **Realm JSON is ready.** `infra/keycloak/kombats-realm.json` contains the `kombats-web` client with all required settings. After `docker-compose down -v && docker-compose up`, Keycloak imports the updated realm. Verify by logging in via `kombats-web` at `http://localhost:8080/realms/kombats/protocol/openid-connect/auth?client_id=kombats-web&response_type=code&redirect_uri=http://localhost:5173/auth/callback&scope=openid+profile+email` (or equivalent via the SPA).

2. **Implement the auth module** as the first frontend implementation task. Auth is the critical path -- every other feature depends on a working token. The implementation should follow Section 11 (UserManager configuration) and integrate with the auth Zustand store and HTTP client as described in `04-frontend-client-architecture.md`.

3. **Run through the deployment validation checklist** (Section 12) before any non-dev environment is considered ready for frontend testing. Dev environment validation is automated by the realm import.
