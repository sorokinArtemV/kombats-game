using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.Battles;

// TODO: temp placeholder 
public sealed record HandleBattleFinishedCommand(BattleFinishedEvent Event) : ICommand;

public sealed class HandleBattleFinishedHandler : ICommandHandler<HandleBattleFinishedCommand>
{
    private const long WinnerXp = 100;
    private const long LoserXp = 25;

    private readonly IInboxRepository _inbox;
    private readonly ICharacterRepository _characters;
    private readonly ILevelingConfigProvider _levelingProvider;
    private readonly IUnitOfWork _uow;

    public HandleBattleFinishedHandler(
        IInboxRepository inbox,
        ICharacterRepository characters,
        ILevelingConfigProvider levelingProvider,
        IUnitOfWork uow)
    {
        _inbox = inbox;
        _characters = characters;
        _levelingProvider = levelingProvider;
        _uow = uow;
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

        return Result.Success();
    }
}

