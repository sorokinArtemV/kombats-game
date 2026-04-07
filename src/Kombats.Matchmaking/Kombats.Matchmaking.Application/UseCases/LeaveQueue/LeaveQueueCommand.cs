using Kombats.Abstractions;

namespace Kombats.Matchmaking.Application.UseCases.LeaveQueue;

public sealed record LeaveQueueCommand(Guid PlayerId, string Variant) : ICommand<LeaveQueueResult>;
