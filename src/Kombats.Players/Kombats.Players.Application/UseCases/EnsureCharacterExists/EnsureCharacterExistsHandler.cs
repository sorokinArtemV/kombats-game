using Kombats.Abstractions;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Entities;

namespace Kombats.Players.Application.UseCases.EnsureCharacterExists;

public sealed class EnsureCharacterExistsHandler
    : ICommandHandler<EnsureCharacterExistsCommand, CharacterStateResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;
    private readonly ICombatProfilePublisher _profilePublisher;

    public EnsureCharacterExistsHandler(
        IUnitOfWork uow,
        ICharacterRepository characters,
        ICombatProfilePublisher profilePublisher)
    {
        _uow = uow;
        _characters = characters;
        _profilePublisher = profilePublisher;
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

            await _profilePublisher.PublishAsync(
                PlayerCombatProfileChangedFactory.FromCharacter(character), ct);

            return Result.Success(CharacterStateResult.FromCharacter(character));
        }
        catch (UniqueConstraintConflictException ex) when (ex.ConflictKind == UniqueConflictKind.IdentityId)
        {
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
