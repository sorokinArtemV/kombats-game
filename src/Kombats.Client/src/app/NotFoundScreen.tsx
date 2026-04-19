import { Link } from 'react-router';

// Branded 404 shown by the router's catch-all. Uses the same KOMBATS title
// treatment as UnauthenticatedShell/SplashScreen so an unknown URL still
// feels like part of the game, not a dev error surface. The "Return Home"
// link points at `/` — if the user is authenticated, UnauthenticatedShell
// will redirect onward to `/lobby`; otherwise they land on the entry screen.
export function NotFoundScreen() {
  return (
    <div
      role="alert"
      aria-labelledby="not-found-title"
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-primary px-6 text-center text-text-primary"
    >
      <div className="flex flex-col items-center gap-4">
        <h1
          id="not-found-title"
          className="font-display text-5xl font-bold uppercase tracking-[0.2em] text-text-primary"
        >
          KOMBATS
        </h1>
        <p className="font-display text-sm uppercase tracking-[0.4em] text-text-muted">
          Signal Lost · 404
        </p>
      </div>

      <p className="max-w-md text-sm text-text-muted">
        This path isn't on the map. The arena is still standing — head back
        and rejoin the fight.
      </p>

      <Link
        to="/"
        className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Return Home
      </Link>
    </div>
  );
}
