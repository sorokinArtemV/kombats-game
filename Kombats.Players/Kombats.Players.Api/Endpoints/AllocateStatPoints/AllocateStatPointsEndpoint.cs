using Kombats.Players.Api.Endpoints;
using Kombats.Players.Api.Extensions;
using Kombats.Players.Api.Filters;
using Kombats.Players.Application.UseCases.AllocateStatPoints;
using Kombats.Shared.CustomResults;
using Kombats.Shared.Types;

namespace Kombats.Players.Api.Endpoints.AllocateStatPoints;

internal sealed class AllocateStatPointsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("api/v1/players/{playerId:guid}/stats/allocate", async (
                Guid playerId,
                AllocateStatPointsRequest request,
                ICommandHandler<AllocateStatPointsCommand, AllocateStatPointsResult> handler,
                CancellationToken cancellationToken) =>
            {
                var command = new AllocateStatPointsCommand(
                    PlayerId: playerId,
                    ExpectedRevision: request.ExpectedRevision,
                    Str: request.Str,
                    Agi: request.Agi,
                    Intuition: request.Intuition,
                    Vit: request.Vit);

                var result = await handler.HandleAsync(command, cancellationToken);

                return result.Match(
                    value => Results.Ok(new AllocateStatPointsResponse(
                        value.Strength,
                        value.Agility,
                        value.Intuition,
                        value.Vitality,
                        value.UnspentPoints,
                        value.Revision)),
                    CustomResults.Problem);
            })
            .WithRequestValidation<AllocateStatPointsRequest>()
            .WithTags(Tags.PlayersStats)
            .WithSummary("Allocate stat points")
            .WithDescription("Allocates unspent stat points to character attributes.")
            .Produces<AllocateStatPointsResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
    }
}

