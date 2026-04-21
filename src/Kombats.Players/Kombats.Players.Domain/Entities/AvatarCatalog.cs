namespace Kombats.Players.Domain.Entities;

/// <summary>
/// Backend-authoritative catalog of allowed player avatar ids.
/// Avatars are predefined cosmetic identifiers; visual assets are resolved by the frontend.
/// Ids are treated as opaque strings on the wire and in downstream projections.
/// Deprecated ids must remain in <see cref="AllowedIds"/> so historical rows stay valid;
/// do not hard-delete entries, add new ones by appending.
/// </summary>
public static class AvatarCatalog
{
    public const string Default = "default";

    public static readonly IReadOnlySet<string> AllowedIds = new HashSet<string>(StringComparer.Ordinal)
    {
        Default,
        "warrior-01",
        "warrior-02",
        "mage-01",
        "mage-02",
        "rogue-01",
        "rogue-02",
    };

    public const int MaxLength = 64;

    public static bool IsValid(string? avatarId)
        => avatarId is not null && AllowedIds.Contains(avatarId);
}
