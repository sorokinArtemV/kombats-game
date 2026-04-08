namespace Kombats.Bff.Application.Models.Internal;

public sealed record InternalCharacterResponse(
    Guid CharacterId,
    Guid IdentityId,
    int OnboardingState,
    string? Name,
    int Strength,
    int Agility,
    int Intuition,
    int Vitality,
    int UnspentPoints,
    int Revision,
    long TotalXp,
    int Level,
    int LevelingVersion);
