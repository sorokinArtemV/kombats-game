namespace Kombats.Auth.Api.Endpoints.Register;

/// <summary>
/// Request DTO for user registration.
/// </summary>
/// <param name="Email">User email address. Must be a valid email format.</param>
/// <param name="Password">User password. Must be at least 8 characters long.</param>
public record RegisterRequest(string Email, string Password);

