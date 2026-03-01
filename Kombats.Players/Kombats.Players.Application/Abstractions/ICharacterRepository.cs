using Kombats.Players.Domain.Entities;

namespace Kombats.Players.Application.Abstractions;

public interface ICharacterRepository
{
    Task<Character?> GetByIdAsync(Guid playerId, CancellationToken ct);
    Task AddAsync(Character character, CancellationToken ct);
}
