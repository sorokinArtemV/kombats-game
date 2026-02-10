using Kombats.Auth.Api.Extensions;
using Kombats.Auth.Api.Filters;
using Kombats.Auth.Application.UseCases.Register;
using Shared;
using static Kombats.Auth.Api.CustomResults.CustomResults;

namespace Kombats.Auth.Api.Endpoints.Register;

public class RegisterEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("api/v1/auth/register", async (
                RegisterRequest request,
                ICommandHandler<RegisterCommand, RegisterResult> handler,
                CancellationToken cancellationToken) =>
            {
                var command = new RegisterCommand(request.Email, request.Password);

                var result = await handler.HandleAsync(command, cancellationToken);

                return result.Match(
                    value => Results.Ok(new RegisterResponse(value.IdentityId)),
                    Problem);
            })
            .WithRequestValidation<RegisterRequest>()
            .WithTags(Tags.AuthRegister)
            .WithSummary("Register a new user account")
            .WithDescription("Creates a new identity with the provided email and password. Returns the created identity ID.")
            .AllowAnonymous()
            .Produces<RegisterResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
    }
}