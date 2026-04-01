using Kombats.Players.Application;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.Helpers;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Exceptions;
using Kombats.Shared.Types;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Players.Application.UseCases.SetCharacterName;

public sealed class SetCharacterNameHandler
    : ICommandHandler<SetCharacterNameCommand, CharacterStateResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;
    private readonly IPublishEndpoint _publishEndpoint;

    public SetCharacterNameHandler(IUnitOfWork uow, ICharacterRepository characters, IPublishEndpoint publishEndpoint)
    {
        _uow = uow;
        _characters = characters;
        _publishEndpoint = publishEndpoint;
    }

    public async Task<Result<CharacterStateResult>> HandleAsync(SetCharacterNameCommand cmd, CancellationToken ct)
    {
        var character = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
        if (character is null)
        {
            return Result.Failure<CharacterStateResult>(
                Error.NotFound("SetCharacterName.NotProvisioned", "Character not provisioned. Call POST /api/me/ensure first."));
        }

        // Pre-check for fast UX feedback; the DB unique index is the real safety net.
        var normalizedName = cmd.Name.Trim().ToLowerInvariant();
        var nameTaken = await _characters.IsNameTakenAsync(normalizedName, character.Id, ct);
        if (nameTaken)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Conflict("SetCharacterName.NameTaken", "This display name is already taken."));
        }

        try
        {
            character.SetNameOnce(cmd.Name);
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

            // MVP: direct publish after SaveChanges. Event may be lost if publish fails.
            await _publishEndpoint.Publish(
                PlayerCombatProfileChangedFactory.FromCharacter(character), ct);

            return Result.Success(CharacterStateResult.FromCharacter(character));
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Conflict(
                    "SetCharacterName.ConcurrentUpdate",
                    "Character was modified by another request. Reload and retry."));
        }
        catch (DbUpdateException ex) when (DbConflictHelper.IsUniqueViolation(ex, DbConflictHelper.NameNormalizedUniqueIndex))
        {
            return Result.Failure<CharacterStateResult>(
                Error.Conflict("SetCharacterName.NameTaken", "This display name is already taken."));
        }
        catch (DbUpdateException ex)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Problem("SetCharacterName.SaveFailed", $"Unexpected database error: {ex.Message}"));
        }
    }
}
