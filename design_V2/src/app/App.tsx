import { useState, useEffect } from 'react';
import {
  MainHub,
  QueueScreen,
  BattleScreen,
  VictoryScreen,
  DefeatScreen,
} from './components/GameScreens';
import { OnboardingScreen, type OnboardingResult } from './components/OnboardingScreen';
import type { BattleLogEntry } from './components/GameShell';

type GameState = 'onboarding' | 'lobby' | 'queue' | 'battle' | 'victory' | 'defeat';

// Mock seed for a new match — replaced wholesale when the next battle begins.
const INITIAL_BATTLE_LOG: BattleLogEntry[] = [
  {
    id: 'r1-a',
    round: 1,
    text: 'Kazumi attacks Head, Shadow Oni blocks Chest — 120 damage.',
    outcome: 'hit',
  },
  {
    id: 'r1-b',
    round: 1,
    text: 'Shadow Oni attacks Chest, Kazumi blocks Chest.',
    outcome: 'blocked',
  },
  {
    id: 'r2-a',
    round: 2,
    text: 'Kazumi attacks Waist, Shadow Oni blocks Legs — 115 damage.',
    outcome: 'hit',
  },
];

const VICTORY_FINAL: BattleLogEntry = {
  id: 'r2-final',
  round: 2,
  text: 'Kazumi lands a clean strike to the Head — Shadow Oni falls.',
  outcome: 'victory',
};

const DEFEAT_FINAL: BattleLogEntry = {
  id: 'r2-final',
  round: 2,
  text: 'Shadow Oni hits Chest for 130 damage while Kazumi guards Waist — Kazumi falls.',
  outcome: 'defeat',
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('onboarding');
  const [queueTime, setQueueTime] = useState(0);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [profile, setProfile] = useState<OnboardingResult | null>(null);

  const handleOnboardingComplete = (result: OnboardingResult) => {
    setProfile(result);
    // Temporary local flow — real onboarding will persist this through the BFF.
    console.info('[onboarding] profile created', result);
    setGameState('lobby');
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'queue') {
      interval = setInterval(() => {
        setQueueTime(prev => prev + 1);
      }, 1000);
    } else {
      setQueueTime(0);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  const handleJoinQueue = () => {
    setGameState('queue');
  };

  const handleCancelQueue = () => {
    setGameState('lobby');
  };

  const handleStartBattle = () => {
    // New match begins — reset the log to the initial seed so we never
    // append across matches.
    setBattleLog(INITIAL_BATTLE_LOG);
    setGameState('battle');
  };

  const handleVictory = () => {
    setBattleLog(prev => [...prev, VICTORY_FINAL]);
    setGameState('victory');
  };

  const handleDefeat = () => {
    setBattleLog(prev => [...prev, DEFEAT_FINAL]);
    setGameState('defeat');
  };

  const handleReturnToLobby = () => {
    setGameState('lobby');
  };

  const handleQueueAgain = () => {
    setGameState('queue');
  };

  // Auto-start battle after queue for demo purposes
  useEffect(() => {
    if (gameState === 'queue' && queueTime >= 3) {
      handleStartBattle();
    }
  }, [gameState, queueTime]);

  const finalEntry = battleLog[battleLog.length - 1];

  switch (gameState) {
    case 'onboarding':
      return <OnboardingScreen onComplete={handleOnboardingComplete} />;

    case 'lobby':
      return <MainHub onJoinQueue={handleJoinQueue} />;

    case 'queue':
      return <QueueScreen onCancel={handleCancelQueue} elapsedTime={queueTime} />;

    case 'battle':
      return (
        <BattleScreen
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          battleLog={battleLog}
        />
      );

    case 'victory':
      return (
        <VictoryScreen
          onReturnToLobby={handleReturnToLobby}
          onQueueAgain={handleQueueAgain}
          finalEntry={finalEntry}
        />
      );

    case 'defeat':
      return (
        <DefeatScreen
          onReturnToLobby={handleReturnToLobby}
          onQueueAgain={handleQueueAgain}
          finalEntry={finalEntry}
        />
      );

    default:
      return <MainHub onJoinQueue={handleJoinQueue} />;
  }
}
