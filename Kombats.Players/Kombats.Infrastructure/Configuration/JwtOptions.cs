using System.ComponentModel.DataAnnotations;

namespace Kombats.Infrastructure.Configuration;

/// <summary>
/// Configuration options for JWT token validation.
/// </summary>
public sealed class JwtOptions
{
    /// <summary>
    /// Configuration section name in appsettings.json.
    /// </summary>
    public const string SectionName = "Jwt";

    /// <summary>
    /// Secret key used for signing JWT tokens. Must be a base64-encoded string or a plain string that will be UTF-8 encoded.
    /// </summary>
    [Required(ErrorMessage = "JWT SecretKey is required")]
    public string SecretKey { get; init; } = string.Empty;

    /// <summary>
    /// JWT issuer claim value. Identifies the principal that issued the JWT.
    /// </summary>
    [Required(ErrorMessage = "JWT Issuer is required")]
    public string Issuer { get; init; } = "Kombats.Auth";

    /// <summary>
    /// JWT audience claim value. Identifies the recipients that the JWT is intended for.
    /// </summary>
    [Required(ErrorMessage = "JWT Audience is required")]
    public string Audience { get; init; } = "Kombats.Auth";
}


