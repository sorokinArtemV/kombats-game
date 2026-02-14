using Kombats.Auth.Api.Extensions;
using Kombats.Auth.Api.Filters;
using Kombats.Auth.Application.UseCases.Login;
using Kombats.Shared.CustomResults;
using Kombats.Shared.Types;

namespace Kombats.Auth.Api.Endpoints.Login;

internal sealed class LoginEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("api/v1/auth/login", async (
                LoginRequest request,
                ICommandHandler<LoginCommand, LoginResult> handler,
                CancellationToken cancellationToken) =>
            {
                var command = new LoginCommand(request.Email, request.Password);

                var result = await handler.HandleAsync(command, cancellationToken);

                return result.Match(
                    value => Results.Ok(new LoginResponse(value.AccessToken, value.RefreshToken)),
                    CustomResults.Problem);
            })
            .WithRequestValidation<LoginRequest>()
            .WithTags(Tags.AuthLogin)
            .AllowAnonymous()
            .Produces<LoginResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
    }
}