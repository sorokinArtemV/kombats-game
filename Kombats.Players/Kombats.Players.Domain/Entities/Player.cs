namespace Kombats.Players.Domain.Entities;

public sealed class Player
{
    public Guid Id { get; set; }           
    public required string DisplayName { get; set; } 
    public DateTimeOffset CreatedAt { get; set; }

    public Character Character { get; set; } 

    private Player() { } // EF

    public Player(Guid id, string displayName, DateTimeOffset createdAt)
    {
        Id = id;
        DisplayName = displayName;
        CreatedAt = createdAt;

        Character = Character.CreateDraft(id, createdAt);
    }

    public void UpdateDisplayName(string displayName)
    {

        DisplayName = displayName;
    }
}
