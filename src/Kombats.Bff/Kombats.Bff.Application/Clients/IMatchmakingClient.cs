using Kombats.Bff.Application.Models.Internal;

namespace Kombats.Bff.Application.Clients;

public interface IMatchmakingClient
{
    Task<InternalQueueStatusResponse> JoinQueueAsync(CancellationToken cancellationToken = default);
    Task<InternalLeaveQueueResponse> LeaveQueueAsync(CancellationToken cancellationToken = default);
    Task<InternalQueueStatusResponse?> GetQueueStatusAsync(CancellationToken cancellationToken = default);
}
