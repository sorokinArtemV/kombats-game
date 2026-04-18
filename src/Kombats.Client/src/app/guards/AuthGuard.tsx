import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/modules/auth/store';
import { decideAuthGuard } from './guard-decisions';

export function AuthGuard() {
  const authStatus = useAuthStore((s) => s.authStatus);
  const decision = decideAuthGuard(authStatus);

  if (decision.type === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-secondary">Checking authentication...</p>
      </div>
    );
  }

  if (decision.type === 'navigate') return <Navigate to={decision.to} replace />;
  return <Outlet />;
}
