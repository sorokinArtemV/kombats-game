namespace Kombats.BuildingBlocks.Messaging.Outbox;

public record OutboxMessage(
    Guid Id,
    DateTimeOffset OccurredAt,
    string Type,
    string Payload,
    int RetryCount = 0);