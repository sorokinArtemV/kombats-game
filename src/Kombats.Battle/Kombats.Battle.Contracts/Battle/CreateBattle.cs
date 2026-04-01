namespace Kombats.Battle.Contracts.Battle;

/// <summary>
/// Command to create a new battle.
/// Matchmaking does NOT provide ruleset — Battle service selects from configuration.
///
/// Target contract carries explicit participant snapshots (PlayerA, PlayerB).
/// PlayerAId / PlayerBId are retained for transitional compatibility with the current
/// outbox dispatcher and consumer. Once Batch 3 enriches the handoff, the consumer
/// should prefer snapshot IdentityIds and these fields can be removed.
/// </summary>
public record CreateBattle
{
    public Guid BattleId { get; init; }
    public Guid MatchId { get; init; }

    /// <summary>Transitional — prefer PlayerA.IdentityId when snapshot is present.</summary>
    public Guid PlayerAId { get; init; }

    /// <summary>Transitional — prefer PlayerB.IdentityId when snapshot is present.</summary>
    public Guid PlayerBId { get; init; }

    public DateTimeOffset RequestedAt { get; init; }

    /// <summary>
    /// Participant combat snapshot for Player A. Null during transitional period
    /// while the Matchmaking outbox dispatcher is not yet enriched (Batch 3).
    /// </summary>
    public BattleParticipantSnapshot? PlayerA { get; init; }

    /// <summary>
    /// Participant combat snapshot for Player B. Null during transitional period
    /// while the Matchmaking outbox dispatcher is not yet enriched (Batch 3).
    /// </summary>
    public BattleParticipantSnapshot? PlayerB { get; init; }
}






