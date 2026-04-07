using Kombats.Abstractions;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Exceptions;

namespace Kombats.Players.Application.UseCases.SetCharacterName;

public sealed class SetCharacterNameHandler
    : ICommandHandler<SetCharacterNameCommand, CharacterStateResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;
    private readonly ICombatProfilePublisher _profilePublisher;

    public SetCharacterNameHandler(
        IUnitOfWork uow,
        ICharacterRepository characters,
        ICombatProfilePublisher profilePublisher)
    {
        _uow = uow;
        _characters = characters;
        _profilePublisher = profilePublisher;
    }

    public async Task<Result<CharacterStateResult>> HandleAsync(SetCharacterNameCommand cmd, CancellationToken ct)
    {
        var character = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
        if (character is null)
        {
            return Result.Failure<CharacterStateResult>(
                Error.NotFound("SetCharacterName.NotProvisioned", "Character not provisioned. Call POST /api/me/ensure first."));
        }

        var normalizedName = cmd.Name.Trim().ToLowerInvariant();
        var nameTaken = await _characters.IsNameTakenAsync(normalizedName, character.Id, ct);
        if (nameTaken)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Conflict("SetCharacterName.NameTaken", "This display name is already taken."));
        }

        try
        {
            character.SetNameOnce(cmd.Name, DateTimeOffset.UtcNow);
        }
        catch (DomainException ex)
        {
            return ex.Code switch
            {
                "InvalidState" => Result.Failure<CharacterStateResult>(
                    Error.Conflict("SetCharacterName.InvalidState", ex.Message)),

                "NameAlreadySet" => Result.Failure<CharacterStateResult>(
                    Error.Conflict("SetCharacterName.NameAlreadySet", ex.Message)),

                "InvalidName" => Result.Failure<CharacterStateResult>(
                    Error.Validation("SetCharacterName.InvalidName", ex.Message)),

                _ => Result.Failure<CharacterStateResult>(
                    Error.Problem("SetCharacterName.DomainError", ex.Message))
            };
        }

        try
        {
            await _uow.SaveChangesAsync(ct);

            await _profilePublisher.PublishAsync(
                PlayerCombatProfileChangedFactory.FromCharacter(character), ct);

            return Result.Success(CharacterStateResult.FromCharacter(character));
        }
        catch (ConcurrencyConflictException)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Conflict(
                    "SetCharacterName.ConcurrentUpdate",
                    "Character was modified by another request. Reload and retry."));
        }
        catch (UniqueConstraintConflictException ex) when (ex.ConflictKind == UniqueConflictKind.CharacterName)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Conflict("SetCharacterName.NameTaken", "This display name is already taken."));
        }
    }
}
