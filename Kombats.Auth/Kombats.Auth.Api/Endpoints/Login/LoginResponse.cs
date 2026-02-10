namespace Kombats.Auth.Api.Endpoints.Login;

/// <summary>
/// Response DTO containing authentication tokens.
/// </summary>
/// <param name="AccessToken">JWT access token for API authorization.</param>
/// <param name="RefreshToken">Refresh token for obtaining new access tokens.</param>
public record LoginResponse(string AccessToken, string RefreshToken);