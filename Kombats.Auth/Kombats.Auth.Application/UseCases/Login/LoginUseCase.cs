using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Domain.Abstractions;
using Kombats.Auth.Domain.Enums;
using Kombats.Auth.Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using Shared;

namespace Kombats.Auth.Application.UseCases.Login;

public sealed class LoginUseCase : ICommandHandler<LoginCommand, LoginResult>
{
    private readonly IClock _clock;
    private readonly IIdentityRepository _identityRepository;
    private readonly ILogger<LoginUseCase> _logger;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IRefreshTokenRepository _refreshTokenRepository;
    private readonly ITokenService _tokenService;

    public LoginUseCase(
        IIdentityRepository identityRepository,
        IPasswordHasher passwordHasher,
        ITokenService tokenService,
        IRefreshTokenRepository refreshTokenRepository,
        IClock clock,
        ILogger<LoginUseCase> logger)
    {
        _identityRepository = identityRepository;
        _passwordHasher = passwordHasher;
        _tokenService = tokenService;
        _refreshTokenRepository = refreshTokenRepository;
        _clock = clock;
        _logger = logger;
    }

    public async Task<Result<LoginResult>> HandleAsync(LoginCommand command, CancellationToken cancellationToken)
    {
        Email email;
        try
        {
            email = Email.Create(command.Email);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<LoginResult>(Error.Validation("Login.InvalidEmail", ex.Message));
        }

        if (string.IsNullOrWhiteSpace(command.Password))
        {
            return Result.Failure<LoginResult>(Error.Validation("Login.PasswordRequired", "Password is required."));
        }

        var identity = await _identityRepository.FindByEmailAsync(email, cancellationToken);

        if (identity is null)
        {
            _logger.LogWarning("Login failed: identity not found for email {Email}", email.Value);
            return Result.Failure<LoginResult>(Error.Validation("Login.InvalidEmail", "Email is invalid."));
        }

        var isPassVerified = _passwordHasher.Verify(command.Password, identity.PasswordHash);

        if (!isPassVerified)
        {
            _logger.LogWarning("Login failed: invalid password for identity {IdentityId}", identity.Id);
            return Result.Failure<LoginResult>(Error.Validation("Login.InvalidCredentials", "Invalid email or password."));
        }

        if (identity.Status == IdentityStatus.Disabled)
        {
            _logger.LogWarning("Login failed: account disabled for identity {IdentityId}", identity.Id);
            return Result.Failure<LoginResult>(Error.Validation("Login.AccountDisabled", "Account is disabled."));
        }

        var accessToken = _tokenService.CreateAccessToken(identity);
        var (refreshToken, refreshTokenHash, refreshTokenExpiresAt) = _tokenService.CreateRefreshToken();

        var refreshTokenInfo = new RefreshTokenInfo(
            Guid.NewGuid(),
            identity.Id,
            refreshTokenHash,
            _clock.UtcNow,
            refreshTokenExpiresAt,
            null,
            null);

        await _refreshTokenRepository.StoreAsync(refreshTokenInfo, cancellationToken);

        _logger.LogInformation("Login successful for identity {IdentityId}, refresh token expires at {ExpiresAt}", 
            identity.Id, refreshTokenExpiresAt);

        return Result.Success(new LoginResult(accessToken, refreshToken));
    }
}