namespace Kombats.Matchmaking.Application.UseCases;

/// <summary>
/// Outbox-serializable payload matching the Battle.Contracts.CreateBattle shape.
/// Matchmaking does not reference Battle.Contracts directly at the application layer;
/// the outbox dispatcher deserializes this to the typed contract before sending.
/// </summary>
internal sealed class CreateBattleOutboxPayload
{
    public Guid BattleId { get; init; }
    public Guid MatchId { get; init; }
    public DateTimeOffset RequestedAt { get; init; }
    public ParticipantSnapshotPayload PlayerA { get; init; } = null!;
    public ParticipantSnapshotPayload PlayerB { get; init; } = null!;
}

internal sealed class ParticipantSnapshotPayload
{
    public Guid IdentityId { get; init; }
    public Guid CharacterId { get; init; }
    public string? Name { get; init; }
    public int Level { get; init; }
    public int Strength { get; init; }
    public int Agility { get; init; }
    public int Intuition { get; init; }
    public int Vitality { get; init; }
}
