using Kombats.Abstractions;

namespace Kombats.Matchmaking.Application.UseCases.GetQueueStatus;

public sealed record GetQueueStatusQuery(Guid PlayerId) : IQuery<QueueStatusResult>;
