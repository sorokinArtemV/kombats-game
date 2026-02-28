using Kombats.Infrastructure.Data;
using Kombats.Players.Application.Abstractions;

namespace Kombats.Infrastructure.Persistence.EF;

public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly PlayersDbContext _db;

    public EfUnitOfWork(PlayersDbContext db)
    {
        _db = db;
    }

    public Task SaveChangesAsync(CancellationToken ct) => _db.SaveChangesAsync(ct);
}