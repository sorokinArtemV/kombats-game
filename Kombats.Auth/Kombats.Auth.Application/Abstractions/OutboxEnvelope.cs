namespace Kombats.Auth.Application.Abstractions;

public sealed record OutboxEnvelope(
    Guid Id,
    DateTimeOffset OccurredAt,
    string Type,
    string Payload);