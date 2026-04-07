using Kombats.Abstractions;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Entities;

namespace Kombats.Players.Application.Battles;

/// <summary>
/// Command to handle the canonical BattleCompleted integration event.
/// Supports no-winner outcomes (WinnerIdentityId/LoserIdentityId may be null).
/// </summary>
public sealed record HandleBattleCompletedCommand(
    Guid MessageId,
    Guid? WinnerIdentityId,
    Guid? LoserIdentityId,
    string Reason) : ICommand;

public sealed class HandleBattleCompletedHandler : ICommandHandler<HandleBattleCompletedCommand>
{
    private const long WinnerXp = 10;
    private const long LoserXp = 5;

    private readonly IInboxRepository _inbox;
    private readonly ICharacterRepository _characters;
    private readonly ILevelingConfigProvider _levelingProvider;
    private readonly IUnitOfWork _uow;
    private readonly ICombatProfilePublisher _profilePublisher;

    public HandleBattleCompletedHandler(
        IInboxRepository inbox,
        ICharacterRepository characters,
        ILevelingConfigProvider levelingProvider,
        IUnitOfWork uow,
        ICombatProfilePublisher profilePublisher)
    {
        _inbox = inbox;
        _characters = characters;
        _levelingProvider = levelingProvider;
        _uow = uow;
        _profilePublisher = profilePublisher;
    }

    public async Task<Result> HandleAsync(HandleBattleCompletedCommand command, CancellationToken cancellationToken)
    {
        if (await _inbox.IsProcessedAsync(command.MessageId, cancellationToken))
        {
            return Result.Success();
        }

        var config = _levelingProvider.Get();
        Character? winner = null;
        Character? loser = null;

        if (command.WinnerIdentityId.HasValue && command.LoserIdentityId.HasValue)
        {
            winner = await _characters.GetByIdentityIdAsync(command.WinnerIdentityId.Value, cancellationToken);
            if (winner is null)
            {
                return Result.Failure(Error.NotFound(
                    "HandleBattleCompleted.WinnerNotFound",
                    $"Character for winner identity {command.WinnerIdentityId} not found."));
            }

            loser = await _characters.GetByIdentityIdAsync(command.LoserIdentityId.Value, cancellationToken);
            if (loser is null)
            {
                return Result.Failure(Error.NotFound(
                    "HandleBattleCompleted.LoserNotFound",
                    $"Character for loser identity {command.LoserIdentityId} not found."));
            }

            var now = DateTimeOffset.UtcNow;
            winner.AddExperience(WinnerXp, config, now);
            winner.RecordWin(now);

            loser.AddExperience(LoserXp, config, now);
            loser.RecordLoss(now);
        }

        await _inbox.AddProcessedAsync(command.MessageId, DateTimeOffset.UtcNow, cancellationToken);

        // Publish before SaveChanges so outbox entries are committed atomically
        // with domain changes (AD-01). With MassTransit outbox configured,
        // IPublishEndpoint.Publish() writes to outbox tables in the DbContext.
        if (winner is not null)
        {
            await _profilePublisher.PublishAsync(
                PlayerCombatProfileChangedFactory.FromCharacter(winner), cancellationToken);
        }

        if (loser is not null)
        {
            await _profilePublisher.PublishAsync(
                PlayerCombatProfileChangedFactory.FromCharacter(loser), cancellationToken);
        }

        await _uow.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
