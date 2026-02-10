namespace Shared.Events;

public record IdentityRegisteredEvent(
    Guid IdentityId,
    string Email,
    DateTimeOffset OccurredAt);

