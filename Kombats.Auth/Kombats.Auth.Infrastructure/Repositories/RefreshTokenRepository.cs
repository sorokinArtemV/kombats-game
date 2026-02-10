using Dapper;
using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Infrastructure.Data;
using Microsoft.Extensions.Logging;

namespace Kombats.Auth.Infrastructure.Repositories;

public sealed class RefreshTokenRepository : IRefreshTokenRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<RefreshTokenRepository> _logger;

    public RefreshTokenRepository(IDbConnectionFactory connectionFactory, ILogger<RefreshTokenRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<RefreshTokenInfo?> FindByHashAsync(string tokenHash,
        CancellationToken cancellationToken = default)
    {
        const string Query = """
                             SELECT 
                                 id,
                                 identity_id,
                                 token_hash,
                                 created_at,
                                 expires_at,
                                 revoked_at,
                                 replaced_by_id
                             FROM auth.refresh_tokens
                             WHERE token_hash = @TokenHash AND revoked_at IS NULL;
                             """;

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var result = await connection.QueryFirstOrDefaultAsync<RefreshTokenEntity>(
            Query, new { TokenHash = tokenHash });

        return result != null ? ToDomain(result) : null;
    }

    public async Task StoreAsync(RefreshTokenInfo token, CancellationToken cancellationToken = default)
    {
        const string Query = """
                             INSERT INTO auth.refresh_tokens 
                                 (id, identity_id, token_hash, created_at, expires_at)
                             VALUES 
                                 (@Id, @IdentityId, @TokenHash, @CreatedAt, @ExpiresAt);
                             """;

        var entity = ToEntity(token);

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(Query, entity);
    }

    public async Task RevokeAsync(Guid tokenId, CancellationToken cancellationToken = default)
    {
        const string Query = """
                             UPDATE auth.refresh_tokens
                             SET revoked_at = @RevokedAt
                             WHERE id = @Id AND revoked_at IS NULL;
                             """;

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(Query, new { Id = tokenId, RevokedAt = DateTimeOffset.UtcNow });
    }

    public async Task RotateAsync(Guid oldTokenId, RefreshTokenInfo newToken,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            const string RevokeQuery = """
                                       UPDATE auth.refresh_tokens
                                       SET revoked_at = @RevokedAt
                                       WHERE id = @Id AND revoked_at IS NULL;
                                       """;
            await connection.ExecuteAsync(RevokeQuery,
                new { Id = oldTokenId, RevokedAt = DateTimeOffset.UtcNow }, transaction);
            
            const string InsertQuery = """
                                       INSERT INTO auth.refresh_tokens 
                                           (id, identity_id, token_hash, created_at, expires_at, replaced_by_id)
                                       VALUES 
                                           (@Id, @IdentityId, @TokenHash, @CreatedAt, @ExpiresAt, NULL);
                                       """;
            var newEntity = ToEntity(newToken);
            await connection.ExecuteAsync(InsertQuery, newEntity, transaction);
            
            const string UpdateQuery = """
                                       UPDATE auth.refresh_tokens
                                       SET replaced_by_id = @OldTokenId
                                       WHERE id = @NewTokenId;
                                       """;
            await connection.ExecuteAsync(UpdateQuery,
                new { NewTokenId = newToken.Id, OldTokenId = oldTokenId }, transaction);

            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to rotate refresh token: old token {OldTokenId}, new token {NewTokenId}, identity {IdentityId}", 
                oldTokenId, newToken.Id, newToken.IdentityId);
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static RefreshTokenEntity ToEntity(RefreshTokenInfo token)
    {
        return new RefreshTokenEntity
        {
            Id = token.Id,
            IdentityId = token.IdentityId,
            TokenHash = token.TokenHash,
            CreatedAt = token.CreatedAt,
            ExpiresAt = token.ExpiresAt,
            RevokedAt = token.RevokedAt,
            ReplacedById = token.ReplacedById
        };
    }

    private static RefreshTokenInfo ToDomain(RefreshTokenEntity entity)
    {
        return new RefreshTokenInfo(
            entity.Id,
            entity.IdentityId,
            entity.TokenHash,
            entity.CreatedAt,
            entity.ExpiresAt,
            entity.RevokedAt,
            entity.ReplacedById);
    }

    private sealed class RefreshTokenEntity
    {
        public Guid Id { get; set; }
        public Guid IdentityId { get; set; }
        public string TokenHash { get; set; } = null!;
        public DateTimeOffset CreatedAt { get; set; }
        public DateTimeOffset ExpiresAt { get; set; }
        public DateTimeOffset? RevokedAt { get; set; }
        public Guid? ReplacedById { get; set; }
        public string? IpAddress { get; set; }
        public string? UserAgent { get; set; }
    }
}