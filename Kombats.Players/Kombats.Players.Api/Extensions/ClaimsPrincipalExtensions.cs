using System.Security.Claims;

namespace Kombats.Players.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Extracts the identity ID (player ID) from the JWT token claims.
    /// The identity ID is stored in either the "identity_id" claim or the "sub" claim.
    /// </summary>
    /// <param name="principal">The claims principal from HttpContext.User</param>
    /// <returns>The identity ID as a Guid, or null if not found or invalid</returns>
    public static Guid? GetIdentityId(this ClaimsPrincipal principal)
    {
        var identityIdClaim = principal.FindFirst("identity_id")?.Value;
        if (!string.IsNullOrEmpty(identityIdClaim) && Guid.TryParse(identityIdClaim, out var identityId))
        {
            return identityId;
        }
        
        var subClaim = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? principal.FindFirst("sub")?.Value;
        if (!string.IsNullOrEmpty(subClaim) && Guid.TryParse(subClaim, out var subId))
        {
            return subId;
        }

        return null;
    }
}


