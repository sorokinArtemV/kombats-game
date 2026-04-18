import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { userManager } from './modules/auth/user-manager';

// eslint-disable-next-line no-console
console.log(
  '[KOMBATS-AUTH-DIAG v3] BUILD MARKER — if you do not see this line on page load, the diagnostic build is NOT running in this browser. Hard-refresh (Ctrl+Shift+R), confirm `pnpm dev` restarted.',
);

// Silent-renew iframe callback: when UserManager does a prompt=none SSO check
// via a hidden iframe, the OP redirects that iframe back to /silent-renew.
// Here we process the auth response and signal the parent frame — we must NOT
// mount the full app inside the iframe (it would navigate, overwrite the URL,
// and break the callback parsing).
if (window.location.pathname === '/silent-renew') {
  userManager.signinSilentCallback().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[KOMBATS-AUTH-DIAG v3] signinSilentCallback failed', err);
  });
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
