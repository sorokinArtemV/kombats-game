
using Kombats.Auth.Api.Endpoints.Login;
using Kombats.Auth.Api.Extensions;
using Kombats.Auth.Api.Filters;
using Kombats.Auth.Application.UseCases.Logout;
using Kombats.Shared.CustomResults;
using Kombats.Shared.Types;

namespace Kombats.Auth.Api.Endpoints.Logout;

internal sealed class LogoutEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("api/v1/auth/logout", async (
                LogoutRequest request,
                ICommandHandler<LogoutCommand> handler,
                CancellationToken cancellationToken) =>
            {
                var command = new LogoutCommand(request.RefreshToken);

                var result = await handler.HandleAsync(command, cancellationToken);

                return result.Match(
                    onSuccess: Results.NoContent,
                    onFailure: CustomResults.Problem);
            })
            .WithRequestValidation<LogoutRequest>()
            .WithTags(Tags.AuthLogout)
            .WithSummary("Revoke refresh token and logout user")
            .WithDescription("Revokes the provided refresh token, effectively logging out the user session.")
            .RequireAuthorization()
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
            
    }
}