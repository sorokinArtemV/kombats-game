import { Navigate, Outlet, useLocation } from 'react-router';
import { usePlayerStore } from '@/modules/player/store';

const DIAG = '[KOMBATS-AUTH-DIAG v3]';

export function OnboardingGuard() {
  const character = usePlayerStore((s) => s.character);
  const isLoaded = usePlayerStore((s) => s.isLoaded);
  const location = useLocation();

  // eslint-disable-next-line no-console
  console.log(`${DIAG} OnboardingGuard`, {
    pathname: location.pathname,
    isLoaded,
    hasCharacter: !!character,
    onboardingState: character?.onboardingState,
  });

  // No character at all — only /onboarding/name is valid.
  if (!character) {
    if (location.pathname === '/onboarding/name') {
      return <Outlet />;
    }
    // eslint-disable-next-line no-console
    console.log(`${DIAG} OnboardingGuard -> Navigate /onboarding/name`, {
      reason: 'no character',
    });
    return <Navigate to="/onboarding/name" replace />;
  }

  const { onboardingState } = character;

  if (onboardingState === 'Draft') {
    if (location.pathname === '/onboarding/name') {
      return <Outlet />;
    }
    // eslint-disable-next-line no-console
    console.log(`${DIAG} OnboardingGuard -> Navigate /onboarding/name`, {
      reason: 'Draft',
    });
    return <Navigate to="/onboarding/name" replace />;
  }

  if (onboardingState === 'Named') {
    if (location.pathname === '/onboarding/stats') {
      return <Outlet />;
    }
    // eslint-disable-next-line no-console
    console.log(`${DIAG} OnboardingGuard -> Navigate /onboarding/stats`, {
      reason: 'Named',
    });
    return <Navigate to="/onboarding/stats" replace />;
  }

  // Ready (or Unknown) — block access to onboarding routes
  if (location.pathname.startsWith('/onboarding')) {
    // eslint-disable-next-line no-console
    console.log(`${DIAG} OnboardingGuard -> Navigate /lobby`, {
      reason: 'Ready, on onboarding route',
    });
    return <Navigate to="/lobby" replace />;
  }

  return <Outlet />;
}
