using Kombats.Abstractions;
using Kombats.Matchmaking.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace Kombats.Matchmaking.Application.UseCases.JoinQueue;

public sealed class JoinQueueHandler : ICommandHandler<JoinQueueCommand, JoinQueueResult>
{
    private readonly IMatchRepository _matchRepository;
    private readonly IPlayerCombatProfileRepository _profileRepository;
    private readonly IMatchQueueStore _queueStore;
    private readonly IPlayerMatchStatusStore _statusStore;
    private readonly ILogger<JoinQueueHandler> _logger;

    public JoinQueueHandler(
        IMatchRepository matchRepository,
        IPlayerCombatProfileRepository profileRepository,
        IMatchQueueStore queueStore,
        IPlayerMatchStatusStore statusStore,
        ILogger<JoinQueueHandler> logger)
    {
        _matchRepository = matchRepository;
        _profileRepository = profileRepository;
        _queueStore = queueStore;
        _statusStore = statusStore;
        _logger = logger;
    }

    public async Task<Result<JoinQueueResult>> HandleAsync(JoinQueueCommand cmd, CancellationToken ct)
    {
        // Check Postgres (source of truth) for active match
        var activeMatch = await _matchRepository.GetActiveForPlayerAsync(cmd.PlayerId, ct);
        if (activeMatch != null)
        {
            _logger.LogInformation(
                "Player has active match, cannot join queue: PlayerId={PlayerId}, MatchId={MatchId}",
                cmd.PlayerId, activeMatch.MatchId);

            return new JoinQueueResult(
                QueuePlayerStatus.AlreadyMatched,
                activeMatch.MatchId,
                activeMatch.BattleId,
                activeMatch.State);
        }

        // Check combat profile exists and is ready
        var profile = await _profileRepository.GetByIdentityIdAsync(cmd.PlayerId, ct);
        if (profile == null)
        {
            return Result.Failure<JoinQueueResult>(
                Error.Validation("Queue.NoCombatProfile", "Player combat profile not found. Character must exist before joining queue."));
        }

        if (!profile.IsReady)
        {
            return Result.Failure<JoinQueueResult>(
                Error.Validation("Queue.NotReady", "Character is not ready. Complete onboarding before joining queue."));
        }

        // Add to queue + set status (both idempotent)
        await _queueStore.TryJoinQueueAsync(cmd.Variant, cmd.PlayerId, ct);
        await _statusStore.SetSearchingAsync(cmd.Variant, cmd.PlayerId, ct);

        _logger.LogInformation("Player joined queue: PlayerId={PlayerId}, Variant={Variant}", cmd.PlayerId, cmd.Variant);

        return new JoinQueueResult(QueuePlayerStatus.Searching);
    }
}
