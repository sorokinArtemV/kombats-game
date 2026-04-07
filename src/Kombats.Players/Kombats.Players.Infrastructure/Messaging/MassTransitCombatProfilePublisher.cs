using Kombats.Players.Application.Abstractions;
using Kombats.Players.Contracts;
using MassTransit;

namespace Kombats.Players.Infrastructure.Messaging;

// TEMPORARY: Bridge adapter until outbox-based publisher is implemented in P-04/P-05.
// Uses direct IPublishEndpoint.Publish() — events may be lost if publish fails after SaveChanges.
// Remove when Infrastructure replacement implements outbox-scoped publishing.
public sealed class MassTransitCombatProfilePublisher : ICombatProfilePublisher
{
    private readonly IPublishEndpoint _publishEndpoint;

    public MassTransitCombatProfilePublisher(IPublishEndpoint publishEndpoint)
    {
        _publishEndpoint = publishEndpoint;
    }

    public Task PublishAsync(PlayerCombatProfileChanged profile, CancellationToken ct)
    {
        return _publishEndpoint.Publish(profile, ct);
    }
}
