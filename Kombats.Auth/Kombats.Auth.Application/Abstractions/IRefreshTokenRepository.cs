namespace Kombats.Auth.Application.Abstractions;

/// <summary>
/// Repository for managing refresh tokens.
/// </summary>
public interface IRefreshTokenRepository
{
    /// <summary>
    /// Finds a refresh token by its hash.
    /// </summary>
    /// <param name="tokenHash">The hashed token value.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The refresh token information if found, otherwise null.</returns>
    public Task<RefreshTokenInfo?> FindByHashAsync(string tokenHash, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Stores a new refresh token.
    /// </summary>
    /// <param name="token">The refresh token information to store.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public Task StoreAsync(RefreshTokenInfo token, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Revokes a refresh token by marking it as revoked.
    /// </summary>
    /// <param name="tokenId">The identifier of the token to revoke.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public Task RevokeAsync(Guid tokenId, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Rotates a refresh token by revoking the old one and storing a new one.
    /// </summary>
    /// <param name="oldTokenId">The identifier of the token to revoke.</param>
    /// <param name="newToken">The new refresh token information to store.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public Task RotateAsync(Guid oldTokenId, RefreshTokenInfo newToken, CancellationToken cancellationToken = default);
}

public record RefreshTokenInfo(
    Guid Id,
    Guid IdentityId,
    string TokenHash,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? RevokedAt,
    Guid? ReplacedById);