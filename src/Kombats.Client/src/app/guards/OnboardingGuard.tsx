import { Navigate, Outlet, useLocation } from 'react-router';
import { usePlayerStore } from '@/modules/player/store';

export function OnboardingGuard() {
  const character = usePlayerStore((s) => s.character);
  const location = useLocation();

  // No character at all — only /onboarding/name is valid.
  // Phase 3 will wire the auto-onboard call that creates the Draft character.
  if (!character) {
    if (location.pathname === '/onboarding/name') {
      return <Outlet />;
    }
    return <Navigate to="/onboarding/name" replace />;
  }

  const { onboardingState } = character;

  if (onboardingState === 'Draft') {
    if (location.pathname === '/onboarding/name') {
      return <Outlet />;
    }
    return <Navigate to="/onboarding/name" replace />;
  }

  if (onboardingState === 'Named') {
    if (location.pathname === '/onboarding/stats') {
      return <Outlet />;
    }
    return <Navigate to="/onboarding/stats" replace />;
  }

  // Ready (or Unknown) — block access to onboarding routes
  if (location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/lobby" replace />;
  }

  return <Outlet />;
}
