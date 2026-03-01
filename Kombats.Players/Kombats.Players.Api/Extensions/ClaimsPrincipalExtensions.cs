using System.Security.Claims;

namespace Kombats.Players.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Extracts the player ID from the Keycloak "sub" claim.
    /// Throws if the claim is missing or not a valid GUID.
    /// </summary>
    public static Guid GetPlayerId(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(sub))
            throw new InvalidOperationException("JWT claim 'sub' is missing.");

        if (!Guid.TryParse(sub, out var playerId))
        {
            throw new InvalidOperationException($"JWT claim 'sub' value '{sub}' is not a valid GUID.");
        }

        return playerId;
    }
}
