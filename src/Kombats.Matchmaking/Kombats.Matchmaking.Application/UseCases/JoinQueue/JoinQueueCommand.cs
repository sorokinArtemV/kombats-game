using Kombats.Abstractions;

namespace Kombats.Matchmaking.Application.UseCases.JoinQueue;

public sealed record JoinQueueCommand(Guid PlayerId, string Variant) : ICommand<JoinQueueResult>;
