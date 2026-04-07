using Kombats.Players.Application.Abstractions;
using Kombats.Players.Contracts;
using MassTransit;

namespace Kombats.Players.Infrastructure.Messaging;

/// <summary>
/// Publishes combat profile change events via MassTransit.
/// When MassTransit outbox is configured (AD-01), IPublishEndpoint.Publish() writes to outbox
/// tables in the DbContext rather than directly to RabbitMQ, ensuring atomicity with domain changes.
/// Callers must invoke PublishAsync before SaveChanges for correct outbox semantics.
/// </summary>
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
