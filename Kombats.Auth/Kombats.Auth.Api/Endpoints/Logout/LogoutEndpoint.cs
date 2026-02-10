using Kombats.Auth.Api.Extensions;
using Kombats.Auth.Api.Filters;
using Kombats.Auth.Application.UseCases.Logout;
using Shared;
using static Kombats.Auth.Api.CustomResults.CustomResults;

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

                var result = await handler.Handle(command, cancellationToken);

                return result.Match(
                    () => Results.Ok(),
                    Problem);
            })
            .WithRequestValidation<LogoutRequest>()
            .WithTags(Tags.AuthLogout)
            .WithSummary("Revoke refresh token and logout user")
            .WithDescription("Revokes the provided refresh token, effectively logging out the user session.")
            .RequireAuthorization() 
            .Produces(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
            
    }
}