using Kombats.Abstractions;

namespace Kombats.Matchmaking.Api.Identity;

public interface ICurrentIdentityProvider
{
    Result<Guid> GetRequiredSubject();
}
