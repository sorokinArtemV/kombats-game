export function SearchingIndicator() {
  return (
    <div className="flex items-center justify-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
        <div className="absolute inset-2 animate-pulse rounded-full bg-accent/40" />
        <div className="absolute inset-4 rounded-full bg-accent" />
      </div>
    </div>
  );
}
