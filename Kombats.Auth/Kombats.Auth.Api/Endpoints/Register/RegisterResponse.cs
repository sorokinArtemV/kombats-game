namespace Kombats.Auth.Api.Endpoints.Register;

/// <summary>
/// Response DTO containing the created identity identifier.
/// </summary>
/// <param name="IdentityId">Unique identifier of the newly created identity.</param>
public record RegisterResponse(Guid IdentityId);

