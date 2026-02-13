using Kombats.Infrastructure.Configuration;
using Kombats.Players.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Infrastructure.Data;

public sealed class PlayersDbContext : DbContext
{
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<InboxMessage> InboxMessages => Set<InboxMessage>();

    public PlayersDbContext(DbContextOptions<PlayersDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new PlayerConfig());
        modelBuilder.ApplyConfiguration(new CharacterConfig());
        modelBuilder.ApplyConfiguration(new InboxMessageConfig());
    }
}
