using Kombats.Abstractions;
using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Exceptions;

namespace Kombats.Players.Application.UseCases.AllocateStatPoints;

public sealed class AllocateStatPointsHandler
    : ICommandHandler<AllocateStatPointsCommand, AllocateStatPointsResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;
    private readonly ICombatProfilePublisher _profilePublisher;

    public AllocateStatPointsHandler(
        IUnitOfWork uow,
        ICharacterRepository characters,
        ICombatProfilePublisher profilePublisher)
    {
        _uow = uow;
        _characters = characters;
        _profilePublisher = profilePublisher;
    }

    public async Task<Result<AllocateStatPointsResult>> HandleAsync(AllocateStatPointsCommand cmd, CancellationToken ct)
    {
        if (cmd.ExpectedRevision <= 0)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Validation("AllocateStatPoints.ExpectedRevisionInvalid", "ExpectedRevision must be a positive integer."));
        }

        var character = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
        if (character is null)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.NotFound("AllocateStatPoints.CharacterNotFound", $"Character for identity {cmd.IdentityId} was not found."));
        }

        if (character.Revision != cmd.ExpectedRevision)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Conflict(
                    "AllocateStatPoints.RevisionMismatch",
                    $"Stale character state. Expected {cmd.ExpectedRevision}, but current is {character.Revision}. Reload and retry."));
        }

        try
        {
            character.AllocatePoints(cmd.Str, cmd.Agi, cmd.Intuition, cmd.Vit, DateTimeOffset.UtcNow);
        }
        catch (DomainException ex)
        {
            return ex.Code switch
            {
                "InvalidState" => Result.Failure<AllocateStatPointsResult>(
                    Error.Conflict("AllocateStatPoints.InvalidState", ex.Message)),

                "NegativePoints" => Result.Failure<AllocateStatPointsResult>(
                    Error.Validation("AllocateStatPoints.NegativePoints", ex.Message)),

                "NotEnoughPoints" => Result.Failure<AllocateStatPointsResult>(
                    Error.Validation("AllocateStatPoints.NotEnoughPoints", ex.Message)),

                "ZeroPoints" => Result.Failure<AllocateStatPointsResult>(
                    Error.Validation("AllocateStatPoints.ZeroPoints", ex.Message)),

                _ => Result.Failure<AllocateStatPointsResult>(
                    Error.Problem("AllocateStatPoints.DomainError", ex.Message))
            };
        }

        try
        {
            await _uow.SaveChangesAsync(ct);
        }
        catch (ConcurrencyConflictException)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Conflict(
                    "AllocateStatPoints.ConcurrentUpdate",
                    "Character was modified by another request. Reload and retry."));
        }

        await _profilePublisher.PublishAsync(
            PlayerCombatProfileChangedFactory.FromCharacter(character), ct);

        return Result.Success(new AllocateStatPointsResult(
            Strength: character.Strength,
            Agility: character.Agility,
            Intuition: character.Intuition,
            Vitality: character.Vitality,
            UnspentPoints: character.UnspentPoints,
            Revision: character.Revision));
    }
}
