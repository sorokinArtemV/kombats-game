using Kombats.Players.Application;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.Helpers;
using Kombats.Players.Domain.Entities;
using Kombats.Shared.Types;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Players.Application.UseCases.EnsureCharacterExists;

public sealed class EnsureCharacterExistsHandler
    : ICommandHandler<EnsureCharacterExistsCommand, CharacterStateResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;

    public EnsureCharacterExistsHandler(IUnitOfWork uow, ICharacterRepository characters)
    {
        _uow = uow;
        _characters = characters;
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
            return Result.Success(CharacterStateResult.FromCharacter(character));
        }
        catch (DbUpdateException ex) when (DbConflictHelper.IsUniqueViolation(ex, DbConflictHelper.IdentityIdUniqueIndex))
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
        catch (DbUpdateException ex)
        {
            return Result.Failure<CharacterStateResult>(
                Error.Problem(
                    "EnsureCharacterExists.SaveFailed",
                    $"Unexpected database error: {ex.Message}"));
        }
    }
}
