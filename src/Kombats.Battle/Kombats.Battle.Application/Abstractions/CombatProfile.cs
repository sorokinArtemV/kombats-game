namespace Kombats.Battle.Application.Abstractions;

/// <summary>
/// Player combat profile (stats snapshot) used during battle initialization.
/// </summary>
public record CombatProfile(
    Guid PlayerId,
    int Strength,
    int Stamina,
    int Agility,
    int Intuition);
