using System.Security.Cryptography;
using System.Text;
using Kombats.Auth.Application.Abstractions;
using Kombats.Shared.Types;
using Microsoft.Extensions.Logging;

namespace Kombats.Auth.Application.UseCases.Logout;

public sealed class LogoutUseCase : ICommandHandler<LogoutCommand>
{
    private readonly ILogger<LogoutUseCase> _logger;
    private readonly IRefreshTokenRepository _refreshTokenRepository;

    public LogoutUseCase(IRefreshTokenRepository refreshTokenRepository, ILogger<LogoutUseCase> logger)
    {
        _refreshTokenRepository = refreshTokenRepository;
        _logger = logger;
    }

    public async Task<Result> HandleAsync(LogoutCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.RefreshToken))
        {
            return Result.Failure(Error.Validation("Logout.TokenRequired", "Refresh token is required."));
        }
        
        var tokenHash = HashToken(command.RefreshToken);
        
        var existingToken = await _refreshTokenRepository.FindByHashAsync(tokenHash, cancellationToken);
        if (existingToken == null)
        {
            _logger.LogWarning("Logout attempted with invalid or non-existent token");
            return Result.Success();
        }
        
        await _refreshTokenRepository.RevokeAsync(existingToken.Id, cancellationToken);

        _logger.LogInformation("Logout successful for identity {IdentityId}, token {TokenId} revoked", 
            existingToken.IdentityId, existingToken.Id);

        return Result.Success();
    }

    private static string HashToken(string token)
    {
        var bytes = Encoding.UTF8.GetBytes(token);
        var hashBytes = SHA256.HashData(bytes);
        return Convert.ToBase64String(hashBytes);
    }
}