import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';

// eslint-disable-next-line no-console
console.log(
  '[KOMBATS-AUTH-DIAG v3] BUILD MARKER — if you do not see this line on page load, the diagnostic build is NOT running in this browser. Hard-refresh (Ctrl+Shift+R), confirm `pnpm dev` restarted.',
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
