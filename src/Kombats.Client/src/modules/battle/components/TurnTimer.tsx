import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useBattlePhase, useBattleTurn } from '../hooks';
import {
  computeTurnTimerView,
  type TurnTimerUrgency,
} from '../turn-timer-view';

export function TurnTimer() {
  const phase = useBattlePhase();
  const { deadlineUtc } = useBattleTurn();
  const [now, setNow] = useState<number>(() => Date.now());

  const countsDown = phase === 'TurnOpen' && deadlineUtc !== null;

  useEffect(() => {
    if (!countsDown) return;

    // setInterval callback is an external subscription, which satisfies
    // react-hooks/set-state-in-effect.
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 100);
    return () => {
      clearInterval(timer);
    };
  }, [countsDown, deadlineUtc]);

  const view = computeTurnTimerView(phase, deadlineUtc, now);

  if (view.kind === 'resolving') {
    return <span className="font-mono text-xs text-warning">Resolving…</span>;
  }
  if (view.kind === 'idle') {
    return <span className="font-mono text-xs text-text-muted">—</span>;
  }

  return (
    <span
      className={clsx('font-mono text-xs tabular-nums', urgencyClass(view.urgency))}
    >
      {view.seconds}s
    </span>
  );
}

function urgencyClass(urgency: TurnTimerUrgency): string {
  switch (urgency) {
    case 'critical':
      return 'text-error';
    case 'warning':
      return 'text-warning';
    default:
      return 'text-text-primary';
  }
}
