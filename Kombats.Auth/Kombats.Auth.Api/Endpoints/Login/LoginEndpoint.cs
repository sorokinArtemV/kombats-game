using Kombats.Auth.Api.Endpoints;
using Kombats.Auth.Api.Endpoints.Login;
using Kombats.Auth.Api.Filters;
using Kombats.Auth.Application.UseCases.Login;
using Kombats.Shared.Types;

Kombats.Shared.Types;



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
                    Problem);
            })
            .WithRequestValidation<LoginRequest>()
            .WithTags(Tags.AuthLogin)
            .WithSummary("Authenticate user and issue access and refresh tokens")
            .WithDescription("Validates user credentials and returns JWT access token and refresh token for authenticated sessions.")
            .AllowAnonymous()
            .Produces<LoginResponse>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
    }
}