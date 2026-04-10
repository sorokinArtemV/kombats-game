using Kombats.Abstractions;
using Kombats.Matchmaking.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace Kombats.Matchmaking.Application.UseCases.LeaveQueue;

internal sealed class LeaveQueueHandler : ICommandHandler<LeaveQueueCommand, LeaveQueueResult>
{
    private readonly IMatchRepository _matchRepository;
    private readonly IMatchQueueStore _queueStore;
    private readonly IPlayerMatchStatusStore _statusStore;
    private readonly ILogger<LeaveQueueHandler> _logger;

    public LeaveQueueHandler(
        IMatchRepository matchRepository,
        IMatchQueueStore queueStore,
        IPlayerMatchStatusStore statusStore,
        ILogger<LeaveQueueHandler> logger)
    {
        _matchRepository = matchRepository;
        _queueStore = queueStore;
        _statusStore = statusStore;
        _logger = logger;
    }

    public async Task<Result<LeaveQueueResult>> HandleAsync(LeaveQueueCommand cmd, CancellationToken ct)
    {
        // Check Postgres (source of truth) for active match
        var activeMatch = await _matchRepository.GetActiveForPlayerAsync(cmd.PlayerId, ct);
        if (activeMatch != null)
        {
            _logger.LogWarning(
                "Player has active match, cannot leave queue: PlayerId={PlayerId}, MatchId={MatchId}",
                cmd.PlayerId, activeMatch.MatchId);

            return new LeaveQueueResult(LeaveQueueStatus.AlreadyMatched, activeMatch.MatchId, activeMatch.BattleId);
        }

        // Check Redis status
        var status = await _statusStore.GetStatusAsync(cmd.PlayerId, ct);
        if (status == null)
        {
            return new LeaveQueueResult(LeaveQueueStatus.NotInQueue);
        }

        // Remove from queue + clear status (both idempotent)
        await _queueStore.TryLeaveQueueAsync(cmd.Variant, cmd.PlayerId, ct);
        await _statusStore.RemoveStatusAsync(cmd.PlayerId, ct);

        _logger.LogInformation("Player left queue: PlayerId={PlayerId}, Variant={Variant}", cmd.PlayerId, cmd.Variant);

        return new LeaveQueueResult(LeaveQueueStatus.Left);
    }
}
