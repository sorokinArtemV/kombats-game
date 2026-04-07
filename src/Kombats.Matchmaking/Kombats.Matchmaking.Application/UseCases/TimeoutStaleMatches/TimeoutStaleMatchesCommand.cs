using Kombats.Abstractions;

namespace Kombats.Matchmaking.Application.UseCases.TimeoutStaleMatches;

/// <summary>
/// Command to timeout matches stuck in BattleCreateRequested state.
/// </summary>
public sealed record TimeoutStaleMatchesCommand(int TimeoutSeconds) : ICommand<int>;
