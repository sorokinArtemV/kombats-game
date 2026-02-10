using Kombats.Auth.Domain.Entities;

namespace Kombats.Auth.Application.Abstractions;

/// <summary>
/// Service for creating and managing JWT access tokens and refresh tokens.
/// </summary>
public interface ITokenService
{
    /// <summary>
    /// Creates a JWT access token for the specified identity.
    /// </summary>
    /// <param name="identity">The identity to create the token for.</param>
    /// <returns>A JWT access token string.</returns>
    public string CreateAccessToken(Identity identity);
    
    /// <summary>
    /// Creates a new refresh token with its hash and expiration time.
    /// </summary>
    /// <returns>A tuple containing the raw token (for client), hash (for storage), and expiration time.</returns>
    public (string RawToken, string Hash, DateTimeOffset ExpiresAt) CreateRefreshToken();
}