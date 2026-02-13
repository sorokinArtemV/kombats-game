using Kombats.Players.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Kombats.Infrastructure.Configuration;

public sealed class PlayerConfig : IEntityTypeConfiguration<Player>
{
    public void Configure(EntityTypeBuilder<Player> b)
    {
        b.ToTable("players");
        b.HasKey(x => x.Id);

        b.Property(x => x.DisplayName).HasMaxLength(64).IsRequired();
        b.Property(x => x.CreatedAt).IsRequired();

        b.HasOne(x => x.Character)
            .WithOne()
            .HasForeignKey<Character>(x => x.Id)  
            .OnDelete(DeleteBehavior.Cascade);
    }
}
