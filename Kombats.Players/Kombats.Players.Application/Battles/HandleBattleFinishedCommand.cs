using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Shared.Types;
using MassTransit;

namespace Kombats.Players.Application.Battles;

// TODO: temp placeholder — inbound consumer wiring is a separate task
internal sealed record HandleBattleFinishedCommand(BattleFinishedEvent Event) : ICommand;

internal sealed class HandleBattleFinishedHandler : ICommandHandler<HandleBattleFinishedCommand>
{
    private const long WinnerXp = 10;
    private const long LoserXp = 5;

    private readonly IInboxRepository _inbox;
    private readonly ICharacterRepository _characters;
    private readonly ILevelingConfigProvider _levelingProvider;
    private readonly IUnitOfWork _uow;
    private readonly IPublishEndpoint _publishEndpoint;

    public HandleBattleFinishedHandler(
        IInboxRepository inbox,
        ICharacterRepository characters,
        ILevelingConfigProvider levelingProvider,
        IUnitOfWork uow,
        IPublishEndpoint publishEndpoint)
    {
        _inbox = inbox;
        _characters = characters;
        _levelingProvider = levelingProvider;
        _uow = uow;
        _publishEndpoint = publishEndpoint;
    }

    public async Task<Result> HandleAsync(HandleBattleFinishedCommand command, CancellationToken cancellationToken)
    {
        var evt = command.Event;

        if (await _inbox.IsProcessedAsync(evt.MessageId, cancellationToken))
        {
            return Result.Success();
        }

        var winner = await _characters.GetByIdentityIdAsync(evt.WinnerIdentityId, cancellationToken);
        if (winner is null)
        {
            return Result.Failure(Error.NotFound(
                "HandleBattleFinished.WinnerNotFound",
                $"Character for winner identity {evt.WinnerIdentityId} not found."));
        }

        var loser = await _characters.GetByIdentityIdAsync(evt.LoserIdentityId, cancellationToken);
        if (loser is null)
        {
            return Result.Failure(Error.NotFound(
                "HandleBattleFinished.LoserNotFound",
                $"Character for loser identity {evt.LoserIdentityId} not found."));
        }

        var config = _levelingProvider.Get();

        winner.AddExperience(WinnerXp, config);
        loser.AddExperience(LoserXp, config);

        await _inbox.AddProcessedAsync(evt.MessageId, DateTimeOffset.UtcNow, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);

        // MVP: direct publish after SaveChanges. Events may be lost if publish fails.
        await _publishEndpoint.Publish(
            PlayerMatchProfileChangedIntegrationEvent.FromCharacter(winner), cancellationToken);
        await _publishEndpoint.Publish(
            PlayerMatchProfileChangedIntegrationEvent.FromCharacter(loser), cancellationToken);

        return Result.Success();
    }
}

