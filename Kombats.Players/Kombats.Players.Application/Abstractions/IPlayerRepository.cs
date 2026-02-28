using Kombats.Players.Domain.Entities;

namespace Kombats.Players.Application.Abstractions;

public interface IPlayerRepository
{
    public Task<Player?> GetByIdAsync(Guid id, CancellationToken ct);
    public void Add(Player player);
}