namespace Kombats.Players.Domain.Entities;

public sealed class Player
{
    public Guid Id { get; private set; }
    public string? DisplayName { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    public Character Character { get; private set; } = null!;

    private Player() { } // EF

    private Player(Guid id, DateTimeOffset createdAt)
    {
        Id = id;
        CreatedAt = createdAt;
        Character = Character.CreateDraft(id, createdAt);
    }

    public static Player CreateNew(Guid id, DateTimeOffset createdAt) => new Player(id, createdAt);

    public void SetDisplayNameOnce(string displayName)
    {
        if (DisplayName is not null)
            throw new InvalidOperationException("DisplayNameAlreadySet");

        var name = displayName.Trim();
        if (name.Length < 3 || name.Length > 16)
            throw new InvalidOperationException("InvalidDisplayName");

        DisplayName = name;
    }
}