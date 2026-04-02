namespace Kombats.Battle.Api.Controllers;

public record CreateBattleRequest
{
    public Guid PlayerAId { get; init; }
    public Guid PlayerBId { get; init; }
    public int? Strength { get; init; }
    public int? Agility { get; init; }
    public int? Intuition { get; init; }
    public int? Vitality { get; init; }
}

public record CreateBattleResponse
{
    public Guid BattleId { get; init; }
    public Guid MatchId { get; init; }
}
