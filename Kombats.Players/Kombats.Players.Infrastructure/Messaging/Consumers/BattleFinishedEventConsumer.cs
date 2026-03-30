using Kombats.Players.Application.Battles;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Shared.Types;
using MassTransit;

namespace Kombats.Players.Infrastructure.Messaging.Consumers;

internal sealed class BattleFinishedEventConsumer : IConsumer<BattleFinishedEvent>
{
    private readonly ICommandHandler<HandleBattleFinishedCommand> _handler;

    public BattleFinishedEventConsumer(ICommandHandler<HandleBattleFinishedCommand> handler)
    {
        _handler = handler;
    }

    public async Task Consume(ConsumeContext<BattleFinishedEvent> context)
    {
        var command = new HandleBattleFinishedCommand(context.Message);
        var result = await _handler.HandleAsync(command, context.CancellationToken);

        if (result.IsFailure)
        {
            throw new InvalidOperationException(
                $"HandleBattleFinished failed: [{result.Error.Code}] {result.Error.Description}");
        }
    }
}
