namespace Kombats.Auth.Api.Endpoints.Refresh;

/// <summary>
/// Response DTO containing new authentication tokens.
/// </summary>
/// <param name="AccessToken">New JWT access token for API authorization.</param>
/// <param name="RefreshToken">New refresh token for obtaining future access tokens.</param>
public record RefreshResponse(string AccessToken, string RefreshToken);

