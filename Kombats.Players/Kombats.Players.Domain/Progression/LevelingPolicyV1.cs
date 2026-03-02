namespace Kombats.Players.Domain.Progression;

/// <summary>
/// Deterministic V1 leveling curve.
/// Triangular thresholds: xpToReach(level) = 50 * level * (level + 1).
/// Level 0 = 0 XP, Level 1 = 100 XP, Level 2 = 300 XP, Level 3 = 600 XP, …
/// </summary>
internal static class LevelingPolicyV1
{
    private const int MaxLevel = 10_000;

    public static int LevelForTotalXp(long totalXp)
    {
        if (totalXp < 0)
        {
            totalXp = 0;
        }

        var level = 0;

        while (level < MaxLevel)
        {
            long nextLevel = level + 1;
            var threshold = 50L * nextLevel * (nextLevel + 1);

            if (threshold > totalXp)
                break;

            level = (int)nextLevel;
        }

        return level;
    }
}

