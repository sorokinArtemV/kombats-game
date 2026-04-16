import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/modules/auth/store';

export function AuthGuard() {
  const authStatus = useAuthStore((s) => s.authStatus);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-secondary">Checking authentication...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
