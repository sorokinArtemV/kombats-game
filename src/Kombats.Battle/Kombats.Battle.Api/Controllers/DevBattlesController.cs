using Kombats.Battle.Contracts.Battle;
using MassTransit;
using Microsoft.AspNetCore.Mvc;

namespace Kombats.Battle.Api.Controllers;

/// <summary>
/// DEV-ONLY: Endpoint for creating battles without Matchmaking service.
/// This endpoint is ONLY available in Development environment.
/// In Production, battles are created via Matchmaking service sending CreateBattle command.
/// </summary>
[ApiController]
[Route("dev/battles")]
public class DevBattlesController : ControllerBase
{
    private readonly ISendEndpointProvider _sendEndpointProvider;
    private readonly ILogger<DevBattlesController> _logger;
    private readonly IWebHostEnvironment _environment;

    public DevBattlesController(
        ISendEndpointProvider sendEndpointProvider,
        ILogger<DevBattlesController> logger,
        IWebHostEnvironment environment)
    {
        _sendEndpointProvider = sendEndpointProvider;
        _logger = logger;
        _environment = environment;
    }

    [HttpPost]
    public async Task<ActionResult<CreateBattleResponse>> CreateBattle([FromBody] CreateBattleRequest request)
    {
        // DEV-ONLY: Check environment
        if (!_environment.IsDevelopment())
        {
            return NotFound(); // Hide endpoint in Production
        }

        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        var battleId = Guid.NewGuid();
        var matchId = Guid.NewGuid(); // Dev: generate fake MatchId

        var command = new Contracts.Battle.CreateBattle
        {
            BattleId = battleId,
            MatchId = matchId,
            RequestedAt = DateTimeOffset.UtcNow,
            PlayerA = new BattleParticipantSnapshot
            {
                IdentityId = request.PlayerAId,
                CharacterId = Guid.NewGuid(),
                Name = "DevPlayerA",
                Level = 1,
                Strength = request.Strength ?? 3,
                Agility = request.Agility ?? 3,
                Intuition = request.Intuition ?? 3,
                Vitality = request.Vitality ?? 3
            },
            PlayerB = new BattleParticipantSnapshot
            {
                IdentityId = request.PlayerBId,
                CharacterId = Guid.NewGuid(),
                Name = "DevPlayerB",
                Level = 1,
                Strength = request.Strength ?? 3,
                Agility = request.Agility ?? 3,
                Intuition = request.Intuition ?? 3,
                Vitality = request.Vitality ?? 3
            }
        };

        _logger.LogInformation(
            "DEV: Creating battle via CreateBattle command. BattleId: {BattleId}, PlayerA: {PlayerAId}, PlayerB: {PlayerBId}",
            battleId, request.PlayerAId, request.PlayerBId);

        var sendEndpoint = await _sendEndpointProvider.GetSendEndpoint(new Uri("queue:battle.create-battle"));
        await sendEndpoint.Send(command);

        return Ok(new CreateBattleResponse
        {
            BattleId = battleId,
            MatchId = matchId
        });
    }
}

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
