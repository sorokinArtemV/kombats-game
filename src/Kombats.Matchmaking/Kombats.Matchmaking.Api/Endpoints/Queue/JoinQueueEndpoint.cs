using Kombats.Abstractions;
using Kombats.Matchmaking.Api.Extensions;
using Kombats.Matchmaking.Api.Identity;
using Kombats.Matchmaking.Application.UseCases.JoinQueue;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Kombats.Matchmaking.Api.Endpoints.Queue;

internal sealed class JoinQueueEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("api/v1/matchmaking/queue/join", async (
                JoinQueueRequest request,
                ICurrentIdentityProvider identity,
                ICommandHandler<JoinQueueCommand, JoinQueueResult> handler,
                CancellationToken ct) =>
            {
                var subjectResult = identity.GetRequiredSubject();
                if (subjectResult.IsFailure) return subjectResult.ToProblem();

                var variant = request.Variant ?? "default";
                var result = await handler.HandleAsync(
                    new JoinQueueCommand(subjectResult.Value, variant), ct);

                return result.Match(
                    value => value.Status == QueuePlayerStatus.AlreadyMatched
                        ? Results.Conflict(new QueueStatusDto("Matched", value.MatchId, value.BattleId, value.MatchState?.ToString()))
                        : Results.Ok(new QueueStatusDto("Searching")),
                    failure => result.ToProblem());
            })
            .RequireAuthorization()
            .WithTags("Queue")
            .Produces<QueueStatusDto>(200)
            .Produces<QueueStatusDto>(409)
            .ProducesProblem(400)
            .ProducesProblem(401);
    }
}

public sealed record JoinQueueRequest(string? Variant);
