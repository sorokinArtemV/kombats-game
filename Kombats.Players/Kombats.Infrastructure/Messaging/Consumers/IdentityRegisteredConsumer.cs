using Kombats.Players.Application.UseCases.RegisterPlayer;
using Kombats.Shared.Events;
using Kombats.Shared.Types;
using MassTransit;

namespace Kombats.Infrastructure.Messaging.Consumers;

public sealed class IdentityRegisteredConsumer : IConsumer<IdentityRegisteredEvent>
{
    private readonly ICommandHandler<RegisterPlayerCommand, RegisterPlayerResult> _handler;

    public IdentityRegisteredConsumer(
        ICommandHandler<RegisterPlayerCommand, RegisterPlayerResult> handler)
    {
        _handler = handler;
    }

    public async Task Consume(ConsumeContext<IdentityRegisteredEvent> context)
    {
        var m = context.Message;

        var command = new RegisterPlayerCommand(
            MessageId: context.MessageId ?? Guid.NewGuid(),
            IdentityId: m.IdentityId,
            Email: m.Email,
            OccuredAt: m.OccurredAt);

        var result = await _handler.HandleAsync(command, context.CancellationToken);

        if (result.IsFailure)
        {
            throw new InvalidOperationException(result.Error.ToString());
        }
    }
}