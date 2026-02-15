using Kombats.Players.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kombats.Infrastructure.Configuration;

public sealed class CharacterConfig : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> b)
    {
        b.ToTable("characters");

        b.HasKey(x => x.Id);
        
        b.Property(x => x.Revision).IsRequired();

        b.Property(x => x.Strength).IsRequired();
        b.Property(x => x.Agility).IsRequired();
        b.Property(x => x.Intuition).IsRequired();
        b.Property(x => x.Vitality).IsRequired();
        b.Property(x => x.UnspentPoints).IsRequired();
    }
}

