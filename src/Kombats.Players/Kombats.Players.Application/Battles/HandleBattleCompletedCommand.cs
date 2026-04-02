using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Entities;
using Kombats.Shared.Types;
using MassTransit;

namespace Kombats.Players.Application.Battles;

/// <summary>
/// Command to handle the canonical BattleCompleted integration event.
/// Supports no-winner outcomes (WinnerIdentityId/LoserIdentityId may be null).
/// </summary>
internal sealed record HandleBattleCompletedCommand(
    Guid MessageId,
    Guid? WinnerIdentityId,
    Guid? LoserIdentityId,
    string Reason) : ICommand;

internal sealed class HandleBattleCompletedHandler : ICommandHandler<HandleBattleCompletedCommand>
{
    private const long WinnerXp = 10;
    private const long LoserXp = 5;

    private readonly IInboxRepository _inbox;
    private readonly ICharacterRepository _characters;
    private readonly ILevelingConfigProvider _levelingProvider;
    private readonly IUnitOfWork _uow;
    private readonly IPublishEndpoint _publishEndpoint;

    public HandleBattleCompletedHandler(
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

    public async Task<Result> HandleAsync(HandleBattleCompletedCommand command, CancellationToken cancellationToken)
    {
        if (await _inbox.IsProcessedAsync(command.MessageId, cancellationToken))
        {
            return Result.Success();
        }

        var config = _levelingProvider.Get();
        Character? winner = null;
        Character? loser = null;

        // No-winner outcome (e.g. DoubleForfeit, mutual timeout): no XP awarded
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

            winner.AddExperience(WinnerXp, config);
            loser.AddExperience(LoserXp, config);
        }

        await _inbox.AddProcessedAsync(command.MessageId, DateTimeOffset.UtcNow, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);

        // MVP: direct publish after SaveChanges. Events may be lost if publish fails.
        if (winner is not null)
        {
            await _publishEndpoint.Publish(
                PlayerCombatProfileChangedFactory.FromCharacter(winner), cancellationToken);
        }

        if (loser is not null)
        {
            await _publishEndpoint.Publish(
                PlayerCombatProfileChangedFactory.FromCharacter(loser), cancellationToken);
        }

        return Result.Success();
    }
}
