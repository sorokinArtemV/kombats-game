namespace Kombats.Matchmaking.Api.Models;

public class LeaveQueueRequest
{
    public required Guid PlayerId { get; init; }
    public string? Variant { get; init; }
}
