namespace Kombats.Auth.Api.Endpoints.Refresh;

/// <summary>
/// Request DTO for token refresh.
/// </summary>
/// <param name="RefreshToken">Refresh token to exchange for new access and refresh tokens.</param>
public record RefreshRequest(string RefreshToken);

