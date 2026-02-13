namespace Kombats.Players.Domain.Entities;

public sealed class InboxMessage
{
    public Guid MessageId { get; init; }
    public DateTimeOffset ProcessedAt { get; init; }
}