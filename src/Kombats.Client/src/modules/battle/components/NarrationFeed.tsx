import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useBattleFeed } from '../hooks';
import { END_OF_BATTLE_TURN_INDEX } from '../feed-merge';
import type {
  BattleFeedEntry,
  FeedEntrySeverity,
  FeedEntryTone,
} from '@/types/battle';

interface NarrationFeedProps {
  /**
   * Optional override. If omitted, entries are read from the battle store.
   * The result screen passes a merged (store + HTTP) deduplicated list.
   */
  entries?: readonly BattleFeedEntry[];
  /** Allow the container to grow to fill available space (e.g. on result screen). */
  fill?: boolean;
}

export function NarrationFeed({ entries: entriesProp, fill = false }: NarrationFeedProps = {}) {
  const storeEntries = useBattleFeed();
  const entries = entriesProp ?? storeEntries;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Key auto-scroll off the tail identity (key + sequence) rather than only
  // length: robust against future updates that replace the tail entry without
  // changing the array length.
  const tail = entries[entries.length - 1];
  const tailSignal = tail ? `${tail.key}:${tail.sequence}` : '';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [tailSignal]);

  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-bg-surface bg-bg-secondary p-4">
      <header>
        <h2 className="font-display text-sm uppercase tracking-wide text-text-primary">
          Battle Feed
        </h2>
      </header>
      {entries.length === 0 ? (
        <p className="text-xs text-text-muted">No events yet.</p>
      ) : (
        <div
          ref={scrollRef}
          className={clsx(
            'flex flex-col gap-1 overflow-y-auto pr-1',
            fill ? 'flex-1 min-h-0' : 'max-h-64',
          )}
        >
          {entries.map((entry) => (
            <FeedRow key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function severityContainerClass(severity: FeedEntrySeverity): string {
  switch (severity) {
    case 'Critical':
      return 'border-l-2 border-error bg-error/10';
    case 'Important':
      return 'border-l-2 border-accent bg-bg-primary';
    case 'Normal':
    default:
      return 'border-l-2 border-bg-surface bg-bg-primary';
  }
}

function toneTextClass(tone: FeedEntryTone): string {
  switch (tone) {
    case 'Aggressive':
      return 'text-accent';
    case 'Defensive':
      return 'text-info';
    case 'Dramatic':
      return 'text-warning italic';
    case 'System':
      return 'font-mono text-text-muted';
    case 'Flavor':
      return 'italic text-text-secondary';
    case 'Neutral':
    default:
      return 'text-text-secondary';
  }
}

function FeedRow({ entry }: { entry: BattleFeedEntry }) {
  const isBattleSummary = entry.turnIndex === END_OF_BATTLE_TURN_INDEX;
  return (
    <div className={clsx('flex gap-2 rounded-sm px-2 py-1 text-xs', severityContainerClass(entry.severity))}>
      {!isBattleSummary && (
        <span className="shrink-0 font-mono text-text-muted">T{entry.turnIndex}</span>
      )}
      <span className={clsx('flex-1', toneTextClass(entry.tone), entry.severity === 'Important' && 'font-medium')}>
        {entry.text}
      </span>
    </div>
  );
}
