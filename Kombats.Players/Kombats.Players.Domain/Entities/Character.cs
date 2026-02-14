namespace Kombats.Players.Domain.Entities;

public sealed class Character
{
    public Guid Id { get; private set; }
    public string? Name { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    public long Revision { get; private set; }
    public long RowVersion { get; private set; }

    public int Strength { get; private set; }
    public int Agility { get; private set; }
    public int Intuition { get; private set; }
    public int Vitality { get; private set; }
    public int UnspentPoints { get; private set; }

    private Character()
    {
    } // EF

    internal static Character CreateDraft(Guid id, DateTimeOffset createdAt)
        => new Character
        {
            Id = id,
            CreatedAt = createdAt,
            Revision = 0,
            Strength = 3,
            Agility = 3,
            Intuition = 3,
            Vitality = 3,
            UnspentPoints = 3
        };

    public void SetNameOnce(string name)
    {
        if (Name is not null)
            throw new InvalidOperationException("NameAlreadySet");

        Name = name.Trim();
        Revision++;
    }

    public void AllocatePoints(int str, int agi, int intui, int vit)
    {
        if (str < 0 || agi < 0 || intui < 0 || vit < 0)
            throw new InvalidOperationException("NegativePoints");

        var total = str + agi + intui + vit;
        if (total > UnspentPoints)
            throw new InvalidOperationException("NotEnoughPoints");

        Strength += str;
        Agility += agi;
        Intuition += intui;
        Vitality += vit;
        UnspentPoints -= total;
        Revision++;
    }
}