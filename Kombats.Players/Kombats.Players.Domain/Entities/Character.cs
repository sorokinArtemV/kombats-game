namespace Kombats.Players.Domain.Entities;

public sealed class Character
{
    public Guid Id { get;  set; }              
    public string Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public long Revision { get;  set; }       
    public long RowVersion { get;  set; }    

    public int Strength { get;  set; }
    public int Agility { get;  set; }
    public int Intuition { get; set; }
    public int Vitality { get; set; }
    public int UnspentPoints { get;  set; }

    private Character() { } // EF

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
        {
            throw new InvalidOperationException("NameAlreadySet");
        }
        Name = name.Trim();
        Revision++;
    }

    public void AllocatePoints(int str, int agi, int intui, int vit)
    {
        if (str < 0 || agi < 0)
        {
            throw new InvalidOperationException("NegativePoints");
        }

        var total = str + agi + intui + vit;
        if (total > UnspentPoints)
        {
            throw new InvalidOperationException("NotEnoughPoints");
        }

        Strength += str;
        Agility += agi;
        UnspentPoints -= total;
        Revision++;
    }
}
