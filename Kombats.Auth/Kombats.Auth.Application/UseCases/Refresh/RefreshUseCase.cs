using System.Security.Cryptography;
using System.Text;
using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Domain.Abstractions;
using Kombats.Auth.Domain.Enums;
using Microsoft.Extensions.Logging;
using Shared;

namespace Kombats.Auth.Application.UseCases.Refresh;

public sealed class RefreshUseCase : ICommandHandler<RefreshCommand, RefreshResult>
{
    private readonly IClock _clock;
    private readonly IIdentityRepository _identityRepository;
    private readonly ILogger<RefreshUseCase> _logger;
    private readonly IRefreshTokenRepository _refreshTokenRepository;
    private readonly ITokenService _tokenService;

    public RefreshUseCase(
        IRefreshTokenRepository refreshTokenRepository,
        ITokenService tokenService,
        IIdentityRepository identityRepository,
        IClock clock,
        ILogger<RefreshUseCase> logger)
    {
        _refreshTokenRepository = refreshTokenRepository;
        _tokenService = tokenService;
        _identityRepository = identityRepository;
        _clock = clock;
        _logger = logger;
    }

    public async Task<Result<RefreshResult>> HandleAsync(RefreshCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.RefreshToken))
        {
            return Result.Failure<RefreshResult>(Error.Validation("Refresh.TokenRequired", "Refresh token is required."));
        }
        
        var tokenHash = HashToken(command.RefreshToken);
        
        var existingToken = await _refreshTokenRepository.FindByHashAsync(tokenHash, cancellationToken);
        if (existingToken == null)
        {
            _logger.LogWarning("Refresh failed: token not found");
            return Result.Failure<RefreshResult>(Error.NotFound("Refresh.InvalidToken", "Invalid or expired refresh token."));
        }
        
        if (existingToken.RevokedAt != null)
        {
            _logger.LogWarning("Refresh failed: token revoked for identity {IdentityId}, token {TokenId}", 
                existingToken.IdentityId, existingToken.Id);
            return Result.Failure<RefreshResult>(Error.Validation("Refresh.TokenRevoked", "Refresh token has been revoked."));
        }
        
        if (existingToken.ExpiresAt <= _clock.UtcNow)
        {
            _logger.LogWarning("Refresh failed: token expired for identity {IdentityId}, token {TokenId}, expired at {ExpiresAt}", 
                existingToken.IdentityId, existingToken.Id, existingToken.ExpiresAt);
            return Result.Failure<RefreshResult>(Error.Validation("Refresh.TokenExpired", "Refresh token has expired."));
        }
        
        var identity = await _identityRepository.GetByIdAsync(existingToken.IdentityId, cancellationToken);
        if (identity == null)
        {
            _logger.LogError("Refresh failed: identity not found for token {TokenId}, identity {IdentityId}", 
                existingToken.Id, existingToken.IdentityId);
            return Result.Failure<RefreshResult>(Error.NotFound("Refresh.IdentityNotFound", "Identity not found."));
        }

        if (identity.Status == IdentityStatus.Disabled)
        {
            _logger.LogWarning("Refresh failed: account disabled for identity {IdentityId}", identity.Id);
            return Result.Failure<RefreshResult>(Error.Validation("Refresh.AccountDisabled", "Account is disabled."));
        }
        
        var accessToken = _tokenService.CreateAccessToken(identity);
        var (newRefreshToken, newRefreshTokenHash, newRefreshTokenExpiresAt) = _tokenService.CreateRefreshToken();
        
        var newRefreshTokenInfo = new RefreshTokenInfo(
            Guid.NewGuid(),
            identity.Id,
            newRefreshTokenHash,
            _clock.UtcNow,
            newRefreshTokenExpiresAt,
            null,
            null);

        await _refreshTokenRepository.RotateAsync(existingToken.Id, newRefreshTokenInfo, cancellationToken);

        _logger.LogInformation("Refresh successful for identity {IdentityId}, new refresh token expires at {ExpiresAt}", 
            identity.Id, newRefreshTokenExpiresAt);

        return Result.Success(new RefreshResult(accessToken, newRefreshToken));
    }

    private static string HashToken(string token)
    {
        var bytes = Encoding.UTF8.GetBytes(token);
        var hashBytes = SHA256.HashData(bytes);
        return Convert.ToBase64String(hashBytes);
    }
}