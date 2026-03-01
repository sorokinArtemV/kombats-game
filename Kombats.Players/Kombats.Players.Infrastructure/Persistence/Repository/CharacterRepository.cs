using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain.Entities;
using Kombats.Players.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Players.Infrastructure.Persistence.Repository;

public sealed class CharacterRepository : ICharacterRepository
{
    private readonly PlayersDbContext _db;

    public CharacterRepository(PlayersDbContext db) => _db = db;

    public Task<Character?> GetByIdentityIdAsync(Guid identityId, CancellationToken ct)
        => _db.Characters
            .FirstOrDefaultAsync(c => c.IdentityId == identityId, ct);

    public Task<Character?> GetByIdAsync(Guid characterId, CancellationToken ct)
        => _db.Characters
            .FirstOrDefaultAsync(c => c.Id == characterId, ct);

    public Task AddAsync(Character character, CancellationToken ct)
    {
        _db.Characters.Add(character);
        return Task.CompletedTask;
    }

    public async Task<bool> IsNameTakenAsync(string normalizedName, Guid? excludeCharacterId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(normalizedName))
            return false;

        var count = await _db.Characters
            .FromSqlRaw(
                @"SELECT id, identity_id, name, strength, agility, intuition, vitality, unspent_points, revision, onboarding_state, created, updated
                  FROM players.characters
                  WHERE name IS NOT NULL AND LOWER(TRIM(name)) = {0} AND ({1} IS NULL OR id <> {1})",
                normalizedName,
                (object?)excludeCharacterId ?? DBNull.Value)
            .CountAsync(ct);

        return count > 0;
    }
}
