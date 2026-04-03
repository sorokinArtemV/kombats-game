namespace Kombats.Matchmaking.Application.UseCases;

/// <summary>
/// Result of leave queue operation.
/// </summary>
public class LeaveQueueResult
{
    public required LeaveQueueResultType Type { get; init; }
    public MatchInfo? MatchInfo { get; init; }

    public static LeaveQueueResult LeftSuccessfully => new() { Type = LeaveQueueResultType.LeftSuccessfully };
    public static LeaveQueueResult NotInQueue => new() { Type = LeaveQueueResultType.NotInQueue };
    public static LeaveQueueResult AlreadyMatched(MatchInfo matchInfo) => new()
    {
        Type = LeaveQueueResultType.AlreadyMatched,
        MatchInfo = matchInfo
    };
}

public enum LeaveQueueResultType
{
    LeftSuccessfully,
    NotInQueue,
    AlreadyMatched
}

public class MatchInfo
{
    public required Guid MatchId { get; init; }
    public required Guid BattleId { get; init; }
}
