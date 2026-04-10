using Kombats.Battle.Contracts.Battle;
using Kombats.Matchmaking.Application.Abstractions;
using MassTransit;

namespace Kombats.Matchmaking.Infrastructure.Messaging;

/// <summary>
/// Publishes CreateBattle commands via MassTransit transactional outbox.
/// When the EF Core outbox is configured, Publish() writes to the outbox table
/// instead of sending directly — atomicity is guaranteed by SaveChanges.
/// </summary>
internal sealed class MassTransitCreateBattlePublisher : ICreateBattlePublisher
{
    private readonly IPublishEndpoint _publishEndpoint;

    public MassTransitCreateBattlePublisher(IPublishEndpoint publishEndpoint)
    {
        _publishEndpoint = publishEndpoint;
    }

    public Task PublishAsync(CreateBattleRequest request, CancellationToken ct = default)
    {
        var command = new CreateBattle
        {
            BattleId = request.BattleId,
            MatchId = request.MatchId,
            RequestedAt = request.RequestedAt,
            PlayerA = new BattleParticipantSnapshot
            {
                IdentityId = request.PlayerA.IdentityId,
                CharacterId = request.PlayerA.CharacterId,
                Name = request.PlayerA.Name,
                Level = request.PlayerA.Level,
                Strength = request.PlayerA.Strength,
                Agility = request.PlayerA.Agility,
                Intuition = request.PlayerA.Intuition,
                Vitality = request.PlayerA.Vitality
            },
            PlayerB = new BattleParticipantSnapshot
            {
                IdentityId = request.PlayerB.IdentityId,
                CharacterId = request.PlayerB.CharacterId,
                Name = request.PlayerB.Name,
                Level = request.PlayerB.Level,
                Strength = request.PlayerB.Strength,
                Agility = request.PlayerB.Agility,
                Intuition = request.PlayerB.Intuition,
                Vitality = request.PlayerB.Vitality
            }
        };

        return _publishEndpoint.Publish(command, ct);
    }
}
