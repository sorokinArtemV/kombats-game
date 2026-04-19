import { Spinner } from './Spinner';

export function SplashScreen() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-primary px-4 text-center"
      role="status"
      aria-live="polite"
      aria-label="Loading Kombats"
    >
      <h1 className="font-display text-5xl font-bold uppercase tracking-[0.2em] text-text-primary">
        KOMBATS
      </h1>
      <Spinner size="md" />
    </div>
  );
}