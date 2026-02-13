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

        b.Property(x => x.Name).HasMaxLength(32);
        b.HasIndex(x => x.Name).IsUnique().HasFilter("name is not null");

        b.Property(x => x.CreatedAt).IsRequired();
        b.Property(x => x.Revision).IsRequired();
        
        b.Property(x => x.RowVersion).IsConcurrencyToken();
    }
}
