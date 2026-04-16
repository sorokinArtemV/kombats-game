import { useAuth } from '@/modules/auth/hooks';

export function UnauthenticatedShell() {
  const { login, register } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-primary">
      <h1 className="font-display text-5xl font-bold text-text-primary">Kombats</h1>
      <p className="text-text-secondary">Turn-based arena combat</p>
      <div className="flex gap-4">
        <button
          onClick={login}
          className="rounded-md bg-accent px-6 py-2 font-medium text-text-primary transition-colors hover:bg-accent-hover"
        >
          Login
        </button>
        <button
          onClick={register}
          className="rounded-md border border-accent px-6 py-2 font-medium text-accent transition-colors hover:bg-accent hover:text-text-primary"
        >
          Register
        </button>
      </div>
    </div>
  );
}
