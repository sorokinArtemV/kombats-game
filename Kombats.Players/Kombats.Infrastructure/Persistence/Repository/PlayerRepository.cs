using Kombats.Infrastructure.Data;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Infrastructure.Repository;

public sealed class PlayerRepository : IPlayerRepository
{
    private readonly PlayersDbContext _db;

    public PlayerRepository(PlayersDbContext db) => _db = db;

    public Task<Player?> GetByIdAsync(Guid id, CancellationToken ct)
        => _db.Players
            .Include(x => x.Character)
            .SingleOrDefaultAsync(x => x.Id == id, ct);

    public void Add(Player player) => _db.Players.Add(player);
}