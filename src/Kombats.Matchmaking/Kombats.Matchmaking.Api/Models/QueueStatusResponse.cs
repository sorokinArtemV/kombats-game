using Kombats.Matchmaking.Application.Abstractions;

namespace Kombats.Matchmaking.Api.Models;

public class QueueStatusResponse
{
    public required string Status { get; init; }
    public Guid? MatchId { get; init; }
    public Guid? BattleId { get; init; }
    public string? MatchState { get; init; }

    public static QueueStatusResponse FromStatus(PlayerMatchStatus status)
    {
        return status.State switch
        {
            PlayerMatchState.Searching => new QueueStatusResponse
            {
                Status = "Searching"
            },
            PlayerMatchState.Matched => new QueueStatusResponse
            {
                Status = "Matched",
                MatchId = status.MatchId,
                BattleId = status.BattleId,
                MatchState = status.MatchState?.ToString()
            },
            _ => throw new InvalidOperationException($"Unknown player match state: {status.State}")
        };
    }
}
