using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Domain.Entities;
using Kombats.Auth.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Kombats.Auth.Infrastructure.Data.Jwt;

public sealed class TokenService : ITokenService
{
    private readonly IClock _clock;
    private readonly JwtOptions _jwtOptions;
    private readonly ILogger<TokenService> _logger;

    public TokenService(IOptions<JwtOptions> jwtOptions, IClock clock, ILogger<TokenService> logger)
    {
        _jwtOptions = jwtOptions.Value;
        _clock = clock;
        _logger = logger;
    }

    public string CreateAccessToken(Identity identity)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var jti = Guid.NewGuid().ToString();
        var expiresAt = _clock.UtcNow.AddMinutes(_jwtOptions.AccessTokenExpirationMinutes).UtcDateTime;

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, identity.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, identity.Email.Value),
            new Claim(JwtRegisteredClaimNames.Jti, jti),
            new Claim("identity_id", identity.Id.ToString())
        };

        var token = new JwtSecurityToken(
            _jwtOptions.Issuer,
            _jwtOptions.Audience,
            claims,
            expires: expiresAt,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        _logger.LogInformation("Access token created for identity {IdentityId}, jti {Jti}, expires at {ExpiresAt}", 
            identity.Id, jti, expiresAt);

        return tokenString;
    }

    public (string RawToken, string Hash, DateTimeOffset ExpiresAt) CreateRefreshToken()
    {
        var expiresAt = _clock.UtcNow.AddDays(_jwtOptions.RefreshTokenExpirationDays);
        
        var randomBytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        var rawToken = Convert.ToBase64String(randomBytes);
        
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        var hash = Convert.ToBase64String(hashBytes);

        _logger.LogInformation("Refresh token created, expires at {ExpiresAt}", expiresAt);

        return (rawToken, hash, expiresAt);
    }
}