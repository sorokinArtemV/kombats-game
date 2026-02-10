namespace Kombats.Auth.Api.Endpoints.Login;

/// <summary>
/// Request DTO for user authentication.
/// </summary>
/// <param name="Email">User email address.</param>
/// <param name="Password">User password.</param>
public record LoginRequest(string Email, string Password);