namespace Kombats.Players.Api.Endpoints.Health;

internal sealed class HealthEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("health", () => Results.Ok(new { status = "healthy" }))
            .AllowAnonymous()
            .WithTags(Tags.Health)
            .WithSummary("Health check")
            .ExcludeFromDescription();
    }
}
