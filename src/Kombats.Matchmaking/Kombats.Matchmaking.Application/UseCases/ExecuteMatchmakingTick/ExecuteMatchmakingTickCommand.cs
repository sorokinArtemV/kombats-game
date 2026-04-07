using Kombats.Abstractions;

namespace Kombats.Matchmaking.Application.UseCases.ExecuteMatchmakingTick;

public sealed record ExecuteMatchmakingTickCommand(string Variant) : ICommand<MatchmakingTickResult>;
