namespace Kombats.Players.Api.Endpoints.GetCharacter;

/// <summary>
/// Response DTO containing character statistics.
/// </summary>
/// <param name="Strength">Character strength stat.</param>
/// <param name="Agility">Character agility stat.</param>
/// <param name="Intuition">Character intuition stat.</param>
/// <param name="Vitality">Character vitality stat.</param>
/// <param name="UnspentPoints">Remaining unspent stat points.</param>
/// <param name="Revision">Character revision number.</param>
public record GetCharacterResponse(
    int Strength,
    int Agility,
    int Intuition,
    int Vitality,
    int UnspentPoints,
    long Revision);

