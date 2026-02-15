namespace Kombats.Players.Api.Endpoints.AllocateStatPoints;

/// <summary>
/// Response DTO containing updated character statistics after stat allocation.
/// </summary>
/// <param name="Strength">Updated strength stat.</param>
/// <param name="Agility">Updated agility stat.</param>
/// <param name="Intuition">Updated intuition stat.</param>
/// <param name="Vitality">Updated vitality stat.</param>
/// <param name="UnspentPoints">Remaining unspent stat points.</param>
/// <param name="Revision">Updated character revision number.</param>
public record AllocateStatPointsResponse(
    int Strength,
    int Agility,
    int Intuition,
    int Vitality,
    int UnspentPoints,
    long Revision);

