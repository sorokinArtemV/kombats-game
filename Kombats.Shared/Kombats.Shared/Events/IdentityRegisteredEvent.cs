namespace Kombats.Shared.Events;

public record IdentityRegisteredEvent(
    Guid IdentityId,
    string Email,
    DateTimeOffset OccurredAt);

public sealed record IdentityRegisteredPayload(
    Guid IdentityId,
    string Email);
