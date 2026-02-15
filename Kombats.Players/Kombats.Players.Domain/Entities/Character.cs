namespace Kombats.Players.Domain.Entities;

public sealed class Character
{
    private Character()
    {
    }

    public Guid Id { get; private set; }

    public int Strength { get; private set; }
    public int Agility { get; private set; }
    public int Intuition { get; private set; }
    public int Vitality { get; private set; }

    public int UnspentPoints { get; private set; }

    // Used for optimistic concurrency (configured as EF concurrency token).
    public int Revision { get; private set; }

    public DateTimeOffset Created { get; private set; }
    public DateTimeOffset Updated { get; private set; }

    public static Character CreateDraft(Guid id, DateTimeOffset occurredAt)
    {
        return new Character
        {
            Id = id,
            Strength = 1,
            Agility = 1,
            Intuition = 1,
            Vitality = 1,
            UnspentPoints = 5,
            Revision = 1,
            Created = occurredAt,
            Updated = occurredAt
        };
    }

    public void AllocatePoints(int str, int agi, int intuition, int vit)
    {
        if (str < 0 || agi < 0 || intuition < 0 || vit < 0)
            throw new InvalidOperationException("NegativePoints");

        var total = str + agi + intuition + vit;
        if (total > UnspentPoints)
            throw new InvalidOperationException("NotEnoughPoints");

        Strength += str;
        Agility += agi;
        Intuition += intuition;
        Vitality += vit;

        UnspentPoints -= total;

        Revision++;
        Updated = DateTimeOffset.UtcNow;
    }
}