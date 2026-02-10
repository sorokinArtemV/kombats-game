using Kombats.Auth.Api.Extensions;
using Kombats.Auth.Api.Filters;
using Kombats.Auth.Application.UseCases.Refresh;
using Shared;
using static Kombats.Auth.Api.CustomResults.CustomResults;

namespace Kombats.Auth.Api.Endpoints.Refresh;

internal sealed class RefreshEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("api/v1/auth/refresh", async (
                RefreshRequest request,
                ICommandHandler<RefreshCommand, RefreshResult> handler,
                CancellationToken cancellationToken) =>
            {
                var command = new RefreshCommand(request.RefreshToken);

                var result = await handler.HandleAsync(command, cancellationToken);

                return result.Match(
                    value => Results.Ok(new RefreshResponse(value.AccessToken, value.RefreshToken)),
                    Problem);
            })
            .WithRequestValidation<RefreshRequest>()
            .WithTags(Tags.AuthRefresh)
            .WithSummary("Refresh access token using refresh token")
            .WithDescription("Validates the refresh token and issues a new access token and refresh token pair. The old refresh token is revoked.")
            .AllowAnonymous()
            .Produces<RefreshResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
    }
}