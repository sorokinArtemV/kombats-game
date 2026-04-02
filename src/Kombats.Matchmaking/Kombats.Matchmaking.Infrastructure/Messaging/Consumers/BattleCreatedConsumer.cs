using Kombats.Battle.Contracts.Battle;
using Kombats.Matchmaking.Application.Abstractions;
using Kombats.Matchmaking.Domain;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace Kombats.Matchmaking.Infrastructure.Messaging.Consumers;

/// <summary>
/// Thin integration consumer for BattleCreated events from Battle service.
/// Advances match state from BattleCreateRequested to BattleCreated.
/// Uses CAS to ensure idempotent, race-free state transition.
/// </summary>
public sealed class BattleCreatedConsumer : IConsumer<BattleCreated>
{
    private readonly IMatchRepository _matchRepository;
    private readonly ILogger<BattleCreatedConsumer> _logger;

    public BattleCreatedConsumer(
        IMatchRepository matchRepository,
        ILogger<BattleCreatedConsumer> logger)
    {
        _matchRepository = matchRepository;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<BattleCreated> context)
    {
        var msg = context.Message;

        _logger.LogInformation(
            "Received BattleCreated: BattleId={BattleId}, MatchId={MatchId}",
            msg.BattleId, msg.MatchId);

        var updated = await _matchRepository.TryUpdateStateAsync(
            msg.MatchId,
            MatchState.BattleCreateRequested,
            MatchState.BattleCreated,
            DateTime.UtcNow,
            context.CancellationToken);

        if (updated)
        {
            _logger.LogInformation(
                "Match {MatchId} advanced to BattleCreated for BattleId={BattleId}",
                msg.MatchId, msg.BattleId);
        }
        else
        {
            _logger.LogInformation(
                "Match {MatchId} was not in BattleCreateRequested state (already advanced or timed out). BattleId={BattleId}",
                msg.MatchId, msg.BattleId);
        }
    }
}
