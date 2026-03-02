using Kombats.Players.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kombats.Players.Infrastructure.Configuration;

public sealed class CharacterConfig : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> b)
    {
        b.ToTable("characters");

        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");

        b.Property(x => x.IdentityId)
            .IsRequired()
            .HasColumnName("identity_id");
        b.HasIndex(x => x.IdentityId).IsUnique();

        b.Property(x => x.Name).HasMaxLength(16);

        b.Property(x => x.OnboardingState)
            .IsRequired()
            .HasColumnName("onboarding_state")
            .HasConversion<int>();

        b.Property(x => x.Revision)
            .IsRequired()
            .IsConcurrencyToken();

        b.Property(x => x.Strength).IsRequired();
        b.Property(x => x.Agility).IsRequired();
        b.Property(x => x.Intuition).IsRequired();
        b.Property(x => x.Vitality).IsRequired();
        b.Property(x => x.UnspentPoints).IsRequired();
        b.Property(x => x.TotalXp).IsRequired().HasColumnName("total_xp");
        b.Property(x => x.Level).IsRequired().HasColumnName("level");
        b.Property(x => x.LevelingVersion).IsRequired().HasColumnName("leveling_version");
        b.Property(x => x.Created).IsRequired();
        b.Property(x => x.Updated).IsRequired();
    }
}
