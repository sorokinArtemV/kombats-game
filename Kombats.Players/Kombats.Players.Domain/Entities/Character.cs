using Kombats.Players.Domain.Exceptions;

namespace Kombats.Players.Domain.Entities;

public sealed class Character
{
    private Character()
    {
    }

    public Guid Id { get; private set; }
    public Guid IdentityId { get; private set; }
    public string? Name { get; private set; }

    public int Strength { get; private set; }
    public int Agility { get; private set; }
    public int Intuition { get; private set; }
    public int Vitality { get; private set; }

    public int UnspentPoints { get; private set; }
    public int Revision { get; private set; }
    public OnboardingState OnboardingState { get; private set; }

    public DateTimeOffset Created { get; private set; }
    public DateTimeOffset Updated { get; private set; }

    public static Character CreateDraft(Guid identityId, DateTimeOffset occurredAt)
    {
        return new Character
        {
            Id = Guid.NewGuid(),
            IdentityId = identityId,
            Strength = 3,
            Agility = 3,
            Intuition = 3,
            Vitality = 3,
            UnspentPoints = 3,
            Revision = 1,
            OnboardingState = OnboardingState.Draft,
            Created = occurredAt,
            Updated = occurredAt
        };
    }

    public void SetNameOnce(string displayName)
    {
        if (OnboardingState != OnboardingState.Draft)
        {
            throw new DomainException("InvalidState", "Name can only be set when character is in Draft state.");
        }

        if (Name is not null)
        {
            throw new DomainException("NameAlreadySet", "Name has already been set.");
        }

        var name = displayName.Trim();
        if (name.Length < 3 || name.Length > 16)
        {
            throw new DomainException("InvalidName", "Name must be between 3 and 16 characters.");
        }

        Name = name;
        OnboardingState = OnboardingState.Named;
        Revision++;
        Updated = DateTimeOffset.UtcNow;
    }

    public void AllocatePoints(int str, int agi, int intuition, int vit)
    {
        if (OnboardingState != OnboardingState.Named && OnboardingState != OnboardingState.Ready)
        {
            throw new DomainException("InvalidState", "Stats can only be allocated when character is Named or Ready.");
        }

        if (str < 0 || agi < 0 || intuition < 0 || vit < 0)
        {
            throw new DomainException("NegativePoints", "Stat point values cannot be negative.");
        }

        var total = str + agi + intuition + vit;
        if (total > UnspentPoints)
            throw new DomainException("NotEnoughPoints", "Insufficient unspent points to allocate.");

        Strength += str;
        Agility += agi;
        Intuition += intuition;
        Vitality += vit;

        UnspentPoints -= total;

        if (OnboardingState == OnboardingState.Named)
        {
            OnboardingState = OnboardingState.Ready;
        }

        Revision++;
        Updated = DateTimeOffset.UtcNow;
    }
}
