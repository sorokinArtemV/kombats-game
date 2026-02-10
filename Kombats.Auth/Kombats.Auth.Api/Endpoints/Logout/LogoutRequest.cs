namespace Kombats.Auth.Api.Endpoints.Logout;

/// <summary>
/// Request DTO for user logout.
/// </summary>
/// <param name="RefreshToken">Refresh token to revoke.</param>
public record LogoutRequest(string RefreshToken);

