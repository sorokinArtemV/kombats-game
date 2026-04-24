import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useBattleFeed } from '../hooks';
import { END_OF_BATTLE_TURN_INDEX } from '../feed-merge';
import type {
  BattleFeedEntry,
  FeedEntryKind,
  FeedEntrySeverity,
  FeedEntryTone,
} from '@/types/battle';

interface NarrationFeedProps {
  entries?: readonly BattleFeedEntry[];
  fill?: boolean;
}

/**
 * Battle log feed. Glass-subtle panel with a gold eyebrow header and
 * per-entry outcome chip derived from the entry's kind
 * (DESIGN_REFERENCE.md §3.20 + §5.15).
 */
export function NarrationFeed({
  entries: entriesProp,
  fill = false,
}: NarrationFeedProps = {}) {
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
        'flex min-h-0 flex-col overflow-hidden rounded-md border-[0.5px] border-border-subtle bg-glass-subtle',
        fill && 'flex-1',
      )}
      style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
    >
      <header className="flex items-center justify-between border-b-[0.5px] border-border-divider px-4 py-2">
        <h2
          className="font-display uppercase"
          style={{
            fontSize: 11,
            letterSpacing: '0.24em',
            color: 'var(--color-accent-text)',
          }}
        >
          Battle Log
        </h2>
      </header>
      <div
        ref={scrollRef}
        className="kombats-scroll flex-1 overflow-y-auto px-4 py-3"
      >
        {entries.length === 0 ? (
          <p className="py-4 text-center text-[11px] uppercase tracking-[0.18em] text-text-muted">
            No events yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {entries.map((entry) => (
              <FeedRow key={entry.key} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function severityBorderColor(severity: FeedEntrySeverity): string {
  switch (severity) {
    case 'Critical':
      return 'var(--color-kombats-crimson)';
    case 'Important':
      return 'var(--color-kombats-gold)';
    case 'Normal':
    default:
      return 'var(--color-border-subtle)';
  }
}

function toneTextClass(tone: FeedEntryTone): string {
  switch (tone) {
    case 'Aggressive':
      return 'text-kombats-crimson-light';
    case 'Defensive':
      return 'text-kombats-jade-light';
    case 'Dramatic':
      return 'italic text-accent-text';
    case 'System':
      return 'font-mono text-text-muted';
    case 'Flavor':
      return 'italic text-text-secondary';
    case 'Neutral':
    default:
      return 'text-text-secondary';
  }
}

function chipLabel(kind: FeedEntryKind): string | null {
  switch (kind) {
    case 'AttackHit':
      return 'Hit';
    case 'AttackCrit':
      return 'Critical';
    case 'AttackBlock':
      return 'Blocked';
    case 'AttackDodge':
      return 'Dodged';
    case 'AttackNoAction':
      return null;
    case 'BattleStart':
      return 'Start';
    case 'BattleEndVictory':
      return 'Victory';
    case 'BattleEndDraw':
      return 'Draw';
    case 'BattleEndForfeit':
      return 'Forfeit';
    case 'DefeatKnockout':
      return 'Defeat';
    default:
      return null;
  }
}

function chipColor(kind: FeedEntryKind): string {
  switch (kind) {
    case 'AttackHit':
    case 'AttackCrit':
    case 'DefeatKnockout':
    case 'BattleEndForfeit':
      return 'var(--color-kombats-crimson)';
    case 'AttackBlock':
    case 'AttackDodge':
    case 'BattleEndVictory':
      return 'var(--color-kombats-jade)';
    default:
      return 'var(--color-kombats-moon-silver)';
  }
}

function FeedRow({ entry }: { entry: BattleFeedEntry }) {
  const isBattleSummary = entry.turnIndex === END_OF_BATTLE_TURN_INDEX;
  const label = chipLabel(entry.kind);
  const color = chipColor(entry.kind);

  return (
    <li
      className="flex flex-col gap-1 pl-2.5 text-[12px]"
      style={{
        borderLeft: `2px solid ${severityBorderColor(entry.severity)}`,
      }}
    >
      <div className="flex items-center gap-2">
        {!isBattleSummary && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            T{entry.turnIndex}
          </span>
        )}
        {label && (
          <span
            className="inline-flex items-center rounded-sm border px-1.5 py-[1px] text-[9px] uppercase tracking-[0.18em]"
            style={{
              color,
              borderColor: `${color}55`,
              background: `${color}14`,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <p
        className={clsx(
          toneTextClass(entry.tone),
          entry.severity === 'Important' && 'font-semibold',
          'leading-snug',
        )}
      >
        {entry.text}
      </p>
    </li>
  );
}
