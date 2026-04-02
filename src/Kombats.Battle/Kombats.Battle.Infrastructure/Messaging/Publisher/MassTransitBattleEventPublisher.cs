using Kombats.Battle.Application.Abstractions;
using Kombats.Battle.Domain.Results;
using Kombats.Battle.Contracts.Battle;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace Kombats.Battle.Infrastructure.Messaging.Publisher;

/// <summary>
/// MassTransit implementation of IBattleEventPublisher.
/// Publishes integration events via MassTransit (with outbox support).
/// Maps domain EndBattleReason to Contracts BattleEndReason.
/// </summary>
public class MassTransitBattleEventPublisher : IBattleEventPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<MassTransitBattleEventPublisher> _logger;

    public MassTransitBattleEventPublisher(
        IPublishEndpoint publishEndpoint,
        ILogger<MassTransitBattleEventPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishBattleCompletedAsync(
        Guid battleId,
        Guid matchId,
        Guid playerAId,
        Guid playerBId,
        EndBattleReason reason,
        Guid? winnerPlayerId,
        DateTimeOffset occurredAt,
        CancellationToken cancellationToken = default)
    {
        var contractReason = MapReason(reason);

        // Derive loser: the participant who is not the winner. Null when no winner.
        Guid? loserPlayerId = winnerPlayerId.HasValue
            ? (winnerPlayerId.Value == playerAId ? playerBId : playerAId)
            : null;

        var battleCompleted = new BattleCompleted
        {
            MessageId = Guid.NewGuid(),
            BattleId = battleId,
            MatchId = matchId,
            PlayerAIdentityId = playerAId,
            PlayerBIdentityId = playerBId,
            WinnerIdentityId = winnerPlayerId,
            LoserIdentityId = loserPlayerId,
            Reason = contractReason,
            OccurredAt = occurredAt,
            Version = 1
        };

        await _publishEndpoint.Publish(battleCompleted, cancellationToken);

        _logger.LogInformation(
            "Published BattleCompleted event for BattleId: {BattleId}, Reason: {Reason}, Winner: {WinnerPlayerId}, Loser: {LoserPlayerId}",
            battleId, contractReason, winnerPlayerId, loserPlayerId);
    }

    private static BattleEndReason MapReason(EndBattleReason domainReason)
    {
        return domainReason switch
        {
            EndBattleReason.Normal => BattleEndReason.Normal,
            EndBattleReason.DoubleForfeit => BattleEndReason.DoubleForfeit,
            EndBattleReason.Timeout => BattleEndReason.Timeout,
            EndBattleReason.Cancelled => BattleEndReason.Cancelled,
            EndBattleReason.AdminForced => BattleEndReason.AdminForced,
            _ => BattleEndReason.SystemError
        };
    }
}
