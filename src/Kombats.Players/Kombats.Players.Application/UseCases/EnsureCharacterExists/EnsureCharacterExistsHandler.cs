using Kombats.Players.Application;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Entities;
using Kombats.Shared.Types;
using MassTransit;

namespace Kombats.Players.Application.UseCases.EnsureCharacterExists;

internal sealed class EnsureCharacterExistsHandler
    : ICommandHandler<EnsureCharacterExistsCommand, CharacterStateResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;
    private readonly IPublishEndpoint _publishEndpoint;

    public EnsureCharacterExistsHandler(
        IUnitOfWork uow,
        ICharacterRepository characters,
        IPublishEndpoint publishEndpoint)
    {
        _uow = uow;
        _characters = characters;
        _publishEndpoint = publishEndpoint;
    }

    public async Task<Result<CharacterStateResult>> HandleAsync(EnsureCharacterExistsCommand cmd, CancellationToken ct)
    {
        var existing = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
        if (existing is not null)
        {
            return Result.Success(CharacterStateResult.FromCharacter(existing));
        }

        var character = Character.CreateDraft(cmd.IdentityId, DateTimeOffset.UtcNow);
        await _characters.AddAsync(character, ct);

        try
        {
            await _uow.SaveChangesAsync(ct);

            // MVP: direct publish after SaveChanges. Event may be lost if publish fails.
            await _publishEndpoint.Publish(
                PlayerCombatProfileChangedFactory.FromCharacter(character), ct);

            return Result.Success(CharacterStateResult.FromCharacter(character));
        }
        catch (UniqueConstraintConflictException ex) when (ex.ConflictKind == UniqueConflictKind.IdentityId)
        {
            // Concurrent create — character already persisted by another request.
            // That request is responsible for publishing the event.
            var race = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
            if (race is not null)
            {
                return Result.Success(CharacterStateResult.FromCharacter(race));
            }

            return Result.Failure<CharacterStateResult>(
                Error.Conflict(
                    "EnsureCharacterExists.ConcurrentCreate",
                    "Character was created by another request. Retry the operation."));
        }
    }
}
