using Kombats.Bff.Application.Models.Internal;

namespace Kombats.Bff.Application.Clients;

public interface IPlayersClient
{
    Task<InternalCharacterResponse?> GetCharacterAsync(CancellationToken cancellationToken = default);
    Task<InternalCharacterResponse?> EnsureCharacterAsync(CancellationToken cancellationToken = default);
    Task<InternalCharacterResponse?> SetCharacterNameAsync(string name, CancellationToken cancellationToken = default);
    Task<InternalCharacterResponse?> AllocateStatsAsync(int expectedRevision, int strength, int agility, int intuition, int vitality, CancellationToken cancellationToken = default);
}
