namespace Kombats.Players.Api.Endpoints.Me;

internal sealed record MeResponse(
    Guid PlayerId,
    string Subject,
    string? Username,
    ClaimDto[] Claims);