using Kombats.Battle.Domain.Results;

namespace Kombats.Battle.Application.Abstractions;

/// <summary>
/// Port interface for publishing integration events.
/// Application defines what it needs; Infrastructure provides MassTransit implementation.
/// </summary>
public interface IBattleEventPublisher
{
    Task PublishBattleEndedAsync(
        Guid battleId,
        Guid matchId,
        EndBattleReason reason,
        Guid? winnerPlayerId,
        DateTimeOffset endedAt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Publishes the canonical BattleCompleted integration event.
    /// Consumed by Players (progression) and Matchmaking (match lifecycle closure).
    /// </summary>
    Task PublishBattleCompletedAsync(
        Guid battleId,
        Guid matchId,
        Guid playerAId,
        Guid playerBId,
        EndBattleReason reason,
        Guid? winnerPlayerId,
        DateTimeOffset occurredAt,
        CancellationToken cancellationToken = default);
}





