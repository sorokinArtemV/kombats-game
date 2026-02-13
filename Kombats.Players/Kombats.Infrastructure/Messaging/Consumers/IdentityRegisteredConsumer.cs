using Kombats.Players.Application.Abstractions;
using Kombats.Shared.Events;
using MassTransit;

namespace Kombats.Infrastructure.Messaging.Consumers;

public sealed class IdentityRegisteredConsumer : IConsumer<IdentityRegisteredEvent>
{
    private readonly IRegisterPlayerService _service;

    public IdentityRegisteredConsumer(IRegisterPlayerService service) => _service = service;

    public Task Consume(ConsumeContext<IdentityRegisteredEvent> context)
        => _service.RegisterAsync(context.Message, context.CancellationToken);
}
