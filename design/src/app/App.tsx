import { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Avatar,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  TextField,
  Chip,
  Stack,
  Paper,
  ButtonGroup,
  Divider,
  CssBaseline
} from '@mui/material';
import {
  PlayArrow,
  Settings,
  PersonOutline,
  Shield,
  Circle,
  Send,
  HourglassEmpty,
  Person,
  Tune,
  EmojiEvents,
  Close
} from '@mui/icons-material';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    primary: {
      main: '#3f51b5',
    },
  },
});

type GameState = 'lobby' | 'battle';
type BattleSubstate = 'choosing' | 'waiting' | 'victory' | 'defeat';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [battleSubstate, setBattleSubstate] = useState<BattleSubstate>('choosing');
  const [selectedAttack, setSelectedAttack] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

  const playerStats = {
    name: 'Shadow_Knight',
    level: 42,
    rating: 1856,
    wins: 127,
    losses: 89,
    hp: 100,
    maxHp: 100,
    strength: 75,
    agility: 60,
    endurance: 85,
    intuition: 55,
  };

  const opponentStats = {
    name: 'Dragon_Fury',
    level: 45,
    rating: 1923,
    hp: 85,
    maxHp: 100,
    strength: 80,
    agility: 70,
    endurance: 65,
    intuition: 90,
  };

  const onlinePlayers = [
    { name: 'Shadow_Knight', status: 'In Battle', rating: 1856 },
    { name: 'Dragon_Fury', status: 'In Battle', rating: 1923 },
    { name: 'Ice_Mage', status: 'Online', rating: 1645 },
    { name: 'Thunder_Strike', status: 'Online', rating: 1789 },
    { name: 'Phoenix_Blade', status: 'In Queue', rating: 1534 },
    { name: 'Steel_Warrior', status: 'Online', rating: 1698 },
  ];

  const battleLog = [
    { turn: 3, message: 'Dragon_Fury attacks HEAD - Shadow_Knight blocks BODY - 15 damage!' },
    { turn: 2, message: 'Shadow_Knight attacks BODY - Dragon_Fury blocks HEAD - CRITICAL HIT! 25 damage!' },
    { turn: 1, message: 'Dragon_Fury attacks LEGS - Shadow_Knight blocks LEGS - Blocked! 0 damage' },
  ];

  const attackZones = ['Head', 'Chest', 'Stomach', 'Waist', 'Legs'];
  const blockZones = [
    'Head and Chest',
    'Chest and Stomach',
    'Stomach and Waist',
    'Waist and Legs',
    'Legs and Head'
  ];

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
        {/* Top Navigation Header */}
        <Box sx={{ py: 1, px: 2, bgcolor: '#0a0a0a', borderBottom: '1px solid #333' }}>
          <Stack direction="row" spacing={3} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: 1 }}>
              KOMBATS
            </Typography>
            <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
              <Button size="small" sx={{ color: 'text.secondary' }}>News</Button>
              <Button size="small" sx={{ color: 'text.secondary' }}>Rules</Button>
              <Button size="small" sx={{ color: 'text.secondary' }}>FAQ</Button>
              <Button size="small" sx={{ color: 'text.secondary' }}>Community</Button>
            </Stack>
            <Button size="small" startIcon={<Person />} sx={{ color: 'text.secondary' }}>
              Profile
            </Button>
            {/* Demo State Toggle */}
            <ButtonGroup size="small" sx={{ ml: 2 }}>
              <Button
                variant={gameState === 'lobby' ? 'contained' : 'outlined'}
                onClick={() => setGameState('lobby')}
              >
                Lobby
              </Button>
              <Button
                variant={gameState === 'battle' ? 'contained' : 'outlined'}
                onClick={() => setGameState('battle')}
              >
                Battle
              </Button>
            </ButtonGroup>
            {gameState === 'battle' && (
              <ButtonGroup size="small">
                <Button
                  variant={battleSubstate === 'choosing' ? 'contained' : 'outlined'}
                  onClick={() => setBattleSubstate('choosing')}
                >
                  Choosing
                </Button>
                <Button
                  variant={battleSubstate === 'waiting' ? 'contained' : 'outlined'}
                  onClick={() => setBattleSubstate('waiting')}
                >
                  Waiting
                </Button>
                <Button
                  variant={battleSubstate === 'victory' ? 'contained' : 'outlined'}
                  onClick={() => setBattleSubstate('victory')}
                >
                  Victory
                </Button>
                <Button
                  variant={battleSubstate === 'defeat' ? 'contained' : 'outlined'}
                  onClick={() => setBattleSubstate('defeat')}
                >
                  Defeat
                </Button>
              </ButtonGroup>
            )}
          </Stack>
        </Box>

        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top Section - Changes Based on State */}
          <Box sx={{ flex: '0 0 60%', p: 2, overflow: 'auto' }}>
            {gameState === 'lobby' ? (
              /* LOBBY STATE */
              <Box sx={{ display: 'flex', gap: 2, height: '100%' }}>
                {/* Left Panel - Player Card */}
                <Card sx={{ width: 340, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
                    {/* Character Portrait - Main Visual */}
                    <Box
                      sx={{
                        bgcolor: '#2a2a3e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        py: 3
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 140,
                          height: 140,
                          bgcolor: '#3f51b5',
                          border: '3px solid #1e1e1e'
                        }}
                      >
                        <PersonOutline sx={{ fontSize: 80 }} />
                      </Avatar>
                    </Box>

                    {/* Info Section */}
                    <Box sx={{ p: 2 }}>
                      <Box sx={{ textAlign: 'center', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {playerStats.name}
                        </Typography>
                        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }}>
                          <Chip label={`Level ${playerStats.level}`} size="small" />
                          <Chip label={`${playerStats.rating}`} size="small" variant="outlined" />
                        </Stack>
                      </Box>

                      {/* HP Bar */}
                      <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Health</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {playerStats.hp}/{playerStats.maxHp}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={(playerStats.hp / playerStats.maxHp) * 100}
                          sx={{ height: 8, borderRadius: 1 }}
                        />
                      </Box>

                      <Divider sx={{ my: 2 }} />

                      {/* Stats */}
                      <Stack spacing={1}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Strength</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.strength}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Agility</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.agility}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Endurance</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.endurance}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Intuition</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.intuition}</Typography>
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 2 }} />

                      {/* Record */}
                      <Stack spacing={0.5}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" color="text.secondary">Wins</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: '#4caf50' }}>{playerStats.wins}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" color="text.secondary">Losses</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: '#f44336' }}>{playerStats.losses}</Typography>
                        </Box>
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>

                {/* Center/Right Panel - Matchmaking */}
                <Card sx={{ flex: 1, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Stack spacing={3} alignItems="center" sx={{ width: '100%', maxWidth: 500 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                          Ready for Combat
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Join the queue to find an opponent
                        </Typography>
                      </Box>

                      <Button
                        variant="contained"
                        size="large"
                        startIcon={<PlayArrow />}
                        onClick={() => setGameState('battle')}
                        sx={{
                          minWidth: 240,
                          py: 1.5,
                          fontSize: '1.1rem',
                          fontWeight: 600
                        }}
                      >
                        Join Queue
                      </Button>

                      <Stack direction="row" spacing={2}>
                        <Button
                          variant="outlined"
                          startIcon={<Person />}
                          size="medium"
                        >
                          Player Settings
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<Tune />}
                          size="medium"
                        >
                          Character Settings
                        </Button>
                      </Stack>

                      <Box sx={{ width: '100%', mt: 2 }}>
                        <Paper sx={{ p: 2, bgcolor: '#252525' }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            Current Build
                          </Typography>
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">Strength</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.strength}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">Agility</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.agility}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">Endurance</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.endurance}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">Intuition</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.intuition}</Typography>
                            </Box>
                          </Stack>
                        </Paper>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            ) : (
              /* BATTLE STATE */
              <Box sx={{ display: 'flex', gap: 2, height: '100%' }}>
                {/* Left Fighter Panel - Player */}
                <Card sx={{ width: 340, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
                    {/* Character Portrait - Main Visual */}
                    <Box
                      sx={{
                        flex: 1,
                        bgcolor: '#2a2a3e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        minHeight: 320
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 180,
                          height: 180,
                          bgcolor: '#3f51b5',
                          border: '4px solid #1e1e1e'
                        }}
                      >
                        <PersonOutline sx={{ fontSize: 100 }} />
                      </Avatar>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 12,
                          left: 12,
                          right: 12
                        }}
                      >
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                          {playerStats.name}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                          Level {playerStats.level}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Stats Section - Below Portrait */}
                    <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
                      <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Health</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {playerStats.hp}/{playerStats.maxHp}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={(playerStats.hp / playerStats.maxHp) * 100}
                          sx={{ height: 10, borderRadius: 1 }}
                        />
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      {/* Character Stats */}
                      <Stack spacing={0.75}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Strength</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.strength}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Agility</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.agility}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Endurance</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.endurance}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Intuition</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{playerStats.intuition}</Typography>
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Chip label="Ready" size="small" color="success" />
                        <Chip label={`${playerStats.rating}`} size="small" variant="outlined" />
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>

                {/* Center Panel - Combat Area */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {battleSubstate === 'victory' || battleSubstate === 'defeat' ? (
                    /* MATCH RESULT STATE - Victory or Defeat */
                    <Card
                      sx={{
                        flex: 1,
                        bgcolor: battleSubstate === 'victory' ? '#1b2e1b' : '#2e1b1b',
                        border: battleSubstate === 'victory' ? '2px solid #4caf50' : '2px solid #f44336',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4 }}>
                        {battleSubstate === 'victory' ? (
                          /* VICTORY STATE */
                          <>
                            <Box
                              sx={{
                                width: 120,
                                height: 120,
                                borderRadius: '50%',
                                bgcolor: '#4caf50',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mb: 3,
                                boxShadow: '0 0 40px rgba(76, 175, 80, 0.4)'
                              }}
                            >
                              <EmojiEvents sx={{ fontSize: 80, color: '#fff' }} />
                            </Box>

                            <Typography
                              variant="h2"
                              sx={{
                                fontWeight: 700,
                                letterSpacing: 4,
                                color: '#4caf50',
                                mb: 2,
                                textShadow: '0 0 20px rgba(76, 175, 80, 0.5)'
                              }}
                            >
                              VICTORY
                            </Typography>

                            <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                              You have defeated {opponentStats.name}
                            </Typography>

                            <Paper sx={{ p: 3, bgcolor: '#252525', mb: 4, minWidth: 400 }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Match Summary
                              </Typography>
                              <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Turns Taken</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>3</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Damage Dealt</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#4caf50' }}>40</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Damage Received</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>0</Typography>
                                </Box>
                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Rating Change</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#4caf50' }}>+24</Typography>
                                </Box>
                              </Stack>
                            </Paper>

                            <Stack direction="row" spacing={2}>
                              <Button
                                variant="contained"
                                size="large"
                                onClick={() => setGameState('lobby')}
                                sx={{
                                  px: 4,
                                  py: 1.5,
                                  bgcolor: '#4caf50',
                                  '&:hover': {
                                    bgcolor: '#45a049'
                                  }
                                }}
                              >
                                Return to Lobby
                              </Button>
                              <Button
                                variant="outlined"
                                size="large"
                                onClick={() => setBattleSubstate('choosing')}
                                sx={{
                                  px: 4,
                                  py: 1.5,
                                  borderColor: '#4caf50',
                                  color: '#4caf50',
                                  '&:hover': {
                                    borderColor: '#45a049',
                                    bgcolor: 'rgba(76, 175, 80, 0.1)'
                                  }
                                }}
                              >
                                Play Again
                              </Button>
                            </Stack>
                          </>
                        ) : (
                          /* DEFEAT STATE */
                          <>
                            <Box
                              sx={{
                                width: 120,
                                height: 120,
                                borderRadius: '50%',
                                bgcolor: '#f44336',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mb: 3,
                                boxShadow: '0 0 40px rgba(244, 67, 54, 0.4)'
                              }}
                            >
                              <Close sx={{ fontSize: 80, color: '#fff', fontWeight: 700 }} />
                            </Box>

                            <Typography
                              variant="h2"
                              sx={{
                                fontWeight: 700,
                                letterSpacing: 4,
                                color: '#f44336',
                                mb: 2,
                                textShadow: '0 0 20px rgba(244, 67, 54, 0.5)'
                              }}
                            >
                              DEFEAT
                            </Typography>

                            <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                              You were defeated by {opponentStats.name}
                            </Typography>

                            <Paper sx={{ p: 3, bgcolor: '#1a1a1a', mb: 4, minWidth: 400, border: '1px solid #3a1a1a' }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Match Summary
                              </Typography>
                              <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Turns Taken</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>3</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Damage Dealt</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>15</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Damage Received</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#f44336' }}>100</Typography>
                                </Box>
                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Rating Change</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#f44336' }}>-18</Typography>
                                </Box>
                              </Stack>
                            </Paper>

                            <Stack direction="row" spacing={2}>
                              <Button
                                variant="contained"
                                size="large"
                                onClick={() => setGameState('lobby')}
                                sx={{
                                  px: 4,
                                  py: 1.5,
                                  bgcolor: '#666',
                                  '&:hover': {
                                    bgcolor: '#555'
                                  }
                                }}
                              >
                                Return to Lobby
                              </Button>
                              <Button
                                variant="outlined"
                                size="large"
                                onClick={() => setBattleSubstate('choosing')}
                                sx={{
                                  px: 4,
                                  py: 1.5,
                                  borderColor: '#f44336',
                                  color: '#f44336',
                                  '&:hover': {
                                    borderColor: '#d32f2f',
                                    bgcolor: 'rgba(244, 67, 54, 0.1)'
                                  }
                                }}
                              >
                                Try Again
                              </Button>
                            </Stack>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    /* NORMAL BATTLE STATE - Choosing or Waiting */
                    <>
                      {/* Top Section - Action Selection or Waiting State */}
                      <Card sx={{ bgcolor: 'background.paper' }}>
                        <CardContent sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                          {battleSubstate === 'choosing' ? (
                            /* Choosing Turn - Compact Centered Action Selection */
                            <Box sx={{ width: '100%', maxWidth: 600 }}>
                              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                {/* Attack Selection */}
                                <Box sx={{ flex: 1 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 600,
                                      mb: 1,
                                      textAlign: 'center',
                                      color: '#f44336'
                                    }}
                                  >
                                    ATTACK
                                  </Typography>
                                  <Stack spacing={0.75}>
                                    {attackZones.map((zone) => (
                                      <Button
                                        key={zone}
                                        variant={selectedAttack === zone ? 'contained' : 'outlined'}
                                        color="error"
                                        size="small"
                                        onClick={() => setSelectedAttack(zone)}
                                        sx={{
                                          justifyContent: 'center',
                                          py: 0.75
                                        }}
                                      >
                                        {zone}
                                      </Button>
                                    ))}
                                  </Stack>
                                </Box>

                                {/* Block Selection */}
                                <Box sx={{ flex: 1 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: 600,
                                      mb: 1,
                                      textAlign: 'center',
                                      color: '#2196f3'
                                    }}
                                  >
                                    BLOCK
                                  </Typography>
                                  <Stack spacing={0.75}>
                                    {blockZones.map((zone) => (
                                      <Button
                                        key={zone}
                                        variant={selectedBlock === zone ? 'contained' : 'outlined'}
                                        color="primary"
                                        size="small"
                                        onClick={() => setSelectedBlock(zone)}
                                        sx={{
                                          justifyContent: 'center',
                                          py: 0.75,
                                          fontSize: '0.8rem'
                                        }}
                                      >
                                        {zone}
                                      </Button>
                                    ))}
                                  </Stack>
                                </Box>
                              </Box>

                              {/* GO Button - Centered and Prominent */}
                              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                                <Button
                                  variant="contained"
                                  size="large"
                                  disabled={!selectedAttack || !selectedBlock}
                                  onClick={() => setBattleSubstate('waiting')}
                                  sx={{
                                    minWidth: 200,
                                    py: 1.5,
                                    px: 6,
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    letterSpacing: 2,
                                    bgcolor: '#4caf50',
                                    '&:hover': {
                                      bgcolor: '#45a049'
                                    },
                                    '&:disabled': {
                                      bgcolor: '#333'
                                    }
                                  }}
                                >
                                  GO
                                </Button>
                              </Box>
                            </Box>
                          ) : (
                            /* Waiting for Opponent */
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                py: 4
                              }}
                            >
                              <HourglassEmpty
                                sx={{
                                  fontSize: 64,
                                  color: '#666',
                                  mb: 2
                                }}
                              />
                              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                Waiting for opponent turn
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Your turn has been submitted
                              </Typography>
                              <Box sx={{ mt: 2 }}>
                                <Chip
                                  label="Turn in progress"
                                  size="small"
                                  color="warning"
                                  sx={{ animation: 'pulse 2s ease-in-out infinite' }}
                                />
                              </Box>
                            </Box>
                          )}
                        </CardContent>
                      </Card>

                      {/* Battle Log - Primary Content Area */}
                      <Card sx={{ flex: 1, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>
                        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                          <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
                            Battle Log
                          </Typography>
                          <Paper
                            sx={{
                              flex: 1,
                              p: 2,
                              bgcolor: '#252525',
                              overflow: 'auto'
                            }}
                          >
                            <Stack spacing={2}>
                              {battleLog.map((log, index) => (
                                <Box key={index}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Turn {log.turn}
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                                    {log.message}
                                  </Typography>
                                  <Divider sx={{ mt: 1.5, opacity: 0.3 }} />
                                </Box>
                              ))}
                            </Stack>
                          </Paper>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </Box>

                {/* Right Fighter Panel - Opponent */}
                <Card sx={{ width: 340, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
                    {/* Character Portrait - Main Visual */}
                    <Box
                      sx={{
                        flex: 1,
                        bgcolor: '#3e2a2a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        minHeight: 320
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 180,
                          height: 180,
                          bgcolor: '#f44336',
                          border: '4px solid #1e1e1e'
                        }}
                      >
                        <PersonOutline sx={{ fontSize: 100 }} />
                      </Avatar>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 12,
                          left: 12,
                          right: 12
                        }}
                      >
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                          {opponentStats.name}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                          Level {opponentStats.level}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Stats Section - Below Portrait */}
                    <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
                      <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Health</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {opponentStats.hp}/{opponentStats.maxHp}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={(opponentStats.hp / opponentStats.maxHp) * 100}
                          sx={{ height: 10, borderRadius: 1 }}
                          color="error"
                        />
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      {/* Character Stats */}
                      <Stack spacing={0.75}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Strength</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{opponentStats.strength}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Agility</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{opponentStats.agility}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Endurance</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{opponentStats.endurance}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Intuition</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{opponentStats.intuition}</Typography>
                        </Box>
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Chip label="Waiting" size="small" color="warning" />
                        <Chip label={`${opponentStats.rating}`} size="small" variant="outlined" />
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}
          </Box>

          {/* Bottom Section - Persistent Chat & Online Players */}
          <Box sx={{ flex: '0 0 40%', p: 2, pt: 0, display: 'flex', gap: 2 }}>
            {/* Chat Panel */}
            <Card sx={{ flex: 1, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Room Chat
                </Typography>
                <Paper
                  sx={{
                    flex: 1,
                    p: 2,
                    bgcolor: '#252525',
                    overflow: 'auto',
                    mb: 2
                  }}
                >
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#4caf50' }}>
                        Shadow_Knight:
                      </Typography>
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Looking for a match!
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#f44336' }}>
                        Dragon_Fury:
                      </Typography>
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Let's go! I'm ready
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#2196f3' }}>
                        Ice_Mage:
                      </Typography>
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Good luck everyone!
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: '#ff9800' }}>
                        Thunder_Strike:
                      </Typography>
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        Anyone up for a quick match after this?
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    placeholder="Type a message..."
                    fullWidth
                    variant="outlined"
                  />
                  <Button variant="contained" sx={{ minWidth: 'auto', px: 2 }}>
                    <Send fontSize="small" />
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Online Players List */}
            <Card sx={{ width: 320, bgcolor: 'background.paper' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Online Players ({onlinePlayers.length})
                </Typography>
                <List sx={{ overflow: 'auto', maxHeight: 300 }}>
                  {onlinePlayers.map((player, index) => (
                    <ListItem key={index} sx={{ px: 0, py: 1 }}>
                      <ListItemAvatar>
                        <Avatar sx={{ width: 36, height: 36 }}>
                          <Circle
                            sx={{
                              fontSize: 12,
                              color: player.status === 'Online' ? '#4caf50' :
                                     player.status === 'In Battle' ? '#f44336' : '#ff9800'
                            }}
                          />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {player.name}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {player.status} • {player.rating}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}