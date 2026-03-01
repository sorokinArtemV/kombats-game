using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain.Entities;
using Kombats.Players.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Players.Infrastructure.Persistence.Repository;

public sealed class CharacterRepository : ICharacterRepository
{
    private readonly PlayersDbContext _db;

    public CharacterRepository(PlayersDbContext db) => _db = db;

    public Task<Character?> GetByIdAsync(Guid playerId, CancellationToken ct)
        => _db.Characters
            .FirstOrDefaultAsync(c => c.PlayerId == playerId, ct);

    public Task AddAsync(Character character, CancellationToken ct)
    {
        _db.Characters.Add(character);
        return Task.CompletedTask;
    }
}
