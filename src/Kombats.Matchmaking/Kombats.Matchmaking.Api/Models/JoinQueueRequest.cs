namespace Kombats.Matchmaking.Api.Models;

public class JoinQueueRequest
{
    public required Guid PlayerId { get; init; }
    public string? Variant { get; init; }
}
