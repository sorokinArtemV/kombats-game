import { useState, useEffect } from 'react';
import {
  MainHub,
  QueueScreen,
  BattleScreen,
  VictoryScreen,
  DefeatScreen,
} from './components/GameScreens';
import { OnboardingScreen, type OnboardingResult } from './components/OnboardingScreen';
import { NotFoundPage } from './components/NotFoundPage';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import type { BattleLogEntry } from './components/GameShell';

type GameState =
  | 'login'
  | 'onboarding'
  | 'lobby'
  | 'queue'
  | 'battle'
  | 'victory'
  | 'defeat'
  | 'gameInfo'
  | 'leaderboard';

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
  // TEMP: start in 'battle' for headless screenshot capture. Revert to 'login'.
  const [gameState, setGameState] = useState<GameState>('battle');
  const [queueTime, setQueueTime] = useState(0);
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>(INITIAL_BATTLE_LOG);
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

  const handleGameInfo = () => {
    setGameState('gameInfo');
  };

  const handleLeaderboard = () => {
    setGameState('leaderboard');
  };

  // Demo-only auth stubs. Real app redirects to Keycloak (login / register
  // realm flows) and routes to lobby or onboarding on successful auth.
  const handleLogin = () => {
    // TODO: keycloak.login()
    setGameState('lobby');
  };

  const handleSignUp = () => {
    // TODO: keycloak.register()
    setGameState('onboarding');
  };

  // Loading screen has no interactive exit. ESC returns to the lobby so
  // the preview state isn't a dead end.
  useEffect(() => {
    if (gameState !== 'leaderboard') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGameState('lobby');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState]);

  // Auto-start battle after queue for demo purposes
  useEffect(() => {
    if (gameState === 'queue' && queueTime >= 3) {
      handleStartBattle();
    }
  }, [gameState, queueTime]);

  const finalEntry = battleLog[battleLog.length - 1];

  const headerNav = {
    onGameInfo: handleGameInfo,
    onLeaderboard: handleLeaderboard,
  };

  switch (gameState) {
    case 'login':
      return <LoginScreen onLogin={handleLogin} onSignUp={handleSignUp} />;

    case 'onboarding':
      return (
        <OnboardingScreen
          onComplete={handleOnboardingComplete}
          {...headerNav}
        />
      );

    case 'lobby':
      return <MainHub onJoinQueue={handleJoinQueue} {...headerNav} />;

    case 'queue':
      return (
        <QueueScreen
          onCancel={handleCancelQueue}
          elapsedTime={queueTime}
          {...headerNav}
        />
      );

    case 'battle':
      return (
        <BattleScreen
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          battleLog={battleLog}
          {...headerNav}
        />
      );

    case 'victory':
      return (
        <VictoryScreen
          onReturnToLobby={handleReturnToLobby}
          onQueueAgain={handleQueueAgain}
          finalEntry={finalEntry}
          {...headerNav}
        />
      );

    case 'defeat':
      return (
        <DefeatScreen
          onReturnToLobby={handleReturnToLobby}
          onQueueAgain={handleQueueAgain}
          finalEntry={finalEntry}
          {...headerNav}
        />
      );

    case 'gameInfo':
      return <NotFoundPage onReturnToLobby={handleReturnToLobby} />;

    case 'leaderboard':
      return <LoadingScreen />;

    default:
      return <MainHub onJoinQueue={handleJoinQueue} {...headerNav} />;
  }
}
