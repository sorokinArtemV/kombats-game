using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Kombats.Battle.Api.Endpoints.Health;

internal sealed class HealthEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("health", () => Results.Ok(new { Status = "Healthy" }))
            .WithTags("Health")
            .AllowAnonymous();
    }
}
