using Kombats.Battle.Infrastructure.Data.Entities;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Battle.Infrastructure.Data.DbContext;

public class BattleDbContext : Microsoft.EntityFrameworkCore.DbContext
{
    public const string Schema = "battle";

    public BattleDbContext(DbContextOptions<BattleDbContext> options) : base(options)
    {
    }

    public DbSet<BattleEntity> Battles { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<BattleEntity>(entity =>
        {
            entity.ToTable("battles");
            entity.HasKey(e => e.BattleId);
            entity.Property(e => e.BattleId).ValueGeneratedNever();
            entity.Property(e => e.MatchId).IsRequired();
            entity.Property(e => e.PlayerAId).IsRequired();
            entity.Property(e => e.PlayerBId).IsRequired();
            entity.Property(e => e.State).IsRequired().HasMaxLength(50);
            entity.Property(e => e.CreatedAt).IsRequired();
            entity.Property(e => e.EndedAt).IsRequired(false);
            entity.Property(e => e.EndReason).HasMaxLength(50).IsRequired(false);
            entity.Property(e => e.WinnerPlayerId).IsRequired(false);
            entity.HasIndex(e => e.MatchId);
        });

        modelBuilder.AddInboxStateEntity(); 
        modelBuilder.AddOutboxMessageEntity();
        modelBuilder.AddOutboxStateEntity();
    }
}