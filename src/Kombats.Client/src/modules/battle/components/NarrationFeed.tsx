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
  entries?: readonly BattleFeedEntry[];
  fill?: boolean;
}

export function NarrationFeed({ entries: entriesProp, fill = false }: NarrationFeedProps = {}) {
  const storeEntries = useBattleFeed();
  const entries = entriesProp ?? storeEntries;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tail = entries[entries.length - 1];
  const tailSignal = tail ? `${tail.key}:${tail.sequence}` : '';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [tailSignal]);

  return (
    <section
      className={clsx(
        'flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-bg-secondary',
        fill && 'flex-1',
      )}
    >
      <header className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-text-primary">Battle Log</h2>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-bg-elevated px-3 py-3"
      >
        {entries.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <FeedRow key={entry.key} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function severityBorderClass(severity: FeedEntrySeverity): string {
  switch (severity) {
    case 'Critical':
      return 'border-l-2 border-error';
    case 'Important':
      return 'border-l-2 border-accent';
    case 'Normal':
    default:
      return 'border-l-2 border-border';
  }
}

function toneTextClass(tone: FeedEntryTone): string {
  switch (tone) {
    case 'Aggressive':
      return 'text-attack';
    case 'Defensive':
      return 'text-block';
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
    <li className={clsx('flex flex-col gap-1 pl-2 text-xs', severityBorderClass(entry.severity))}>
      {!isBattleSummary && (
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Turn {entry.turnIndex}
        </span>
      )}
      <p className={clsx(toneTextClass(entry.tone), entry.severity === 'Important' && 'font-semibold')}>
        {entry.text}
      </p>
    </li>
  );
}
