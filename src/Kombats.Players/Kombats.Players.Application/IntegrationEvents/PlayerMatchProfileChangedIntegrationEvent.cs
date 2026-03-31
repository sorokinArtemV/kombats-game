using Kombats.Players.Domain.Entities;

namespace Kombats.Players.Application.IntegrationEvents;

public sealed record PlayerMatchProfileChangedIntegrationEvent(
    Guid IdentityId,
    Guid CharacterId,
    int Level,
    bool IsReady,
    int Revision,
    DateTimeOffset OccurredAt)
{
    public static PlayerMatchProfileChangedIntegrationEvent FromCharacter(Character character)
    {
        return new PlayerMatchProfileChangedIntegrationEvent(
            IdentityId: character.IdentityId,
            CharacterId: character.Id,
            Level: character.Level,
            IsReady: character.OnboardingState == OnboardingState.Ready,
            Revision: character.Revision,
            OccurredAt: DateTimeOffset.UtcNow);
    }
}
