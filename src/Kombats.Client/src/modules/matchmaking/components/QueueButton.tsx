import { useState } from 'react';
import { Button } from '@/ui/components/Button';
import { useMatchmaking } from '../hooks';

export function QueueButton() {
  const { status, joinQueue } = useMatchmaking();
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinQueue();
    } finally {
      setJoining(false);
    }
  };

  const disabled = status !== 'idle' || joining;

  return (
    <Button onClick={handleJoin} loading={joining} disabled={disabled}>
      {joining ? 'Joining...' : 'Find Battle'}
    </Button>
  );
}
