using Kombats.Players.Api.Extensions;

namespace Kombats.Players.Api.Endpoints.Me;

internal sealed class MeEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("api/me", (HttpContext httpContext) =>
            {
                var user = httpContext.User;
                var playerId = user.GetPlayerId();

                return Results.Ok(new MeResponse(
                    PlayerId: playerId,
                    Subject: user.FindFirst("sub")?.Value ?? string.Empty,
                    Username: user.FindFirst("preferred_username")?.Value,
                    Claims: user.Claims
                        .Select(c => new ClaimDto(c.Type, c.Value))
                        .ToArray()));
            })
            .RequireAuthorization()
            .WithTags(Tags.Account)
            .WithSummary("Current player info")
            .WithDescription("Returns the authenticated player's identity extracted from the Keycloak access token.")
            .Produces<MeResponse>()
            .ProducesProblem(StatusCodes.Status401Unauthorized);
    }
}