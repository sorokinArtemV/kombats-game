using System.ComponentModel.DataAnnotations;

namespace Kombats.Players.Api.Auth;

public sealed class KeycloakAuthOptions
{
    public const string SectionName = "Auth";

    [Required(ErrorMessage = "Auth:Authority is required (e.g. http://localhost:8080/realms/kombats)")]
    public string Authority { get; init; } = string.Empty;

    [Required(ErrorMessage = "Auth:Audience is required (e.g. kombats-backend)")]
    public string Audience { get; init; } = string.Empty;

    public bool RequireHttpsMetadata { get; init; } = true;
}
