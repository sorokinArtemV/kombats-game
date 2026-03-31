namespace Kombats.Players.Application.IntegrationEvents;

public sealed record BattleFinishedEvent(
    Guid MessageId,
    Guid WinnerIdentityId,
    Guid LoserIdentityId,
    string BattleType,
    DateTimeOffset OccurredAt);

