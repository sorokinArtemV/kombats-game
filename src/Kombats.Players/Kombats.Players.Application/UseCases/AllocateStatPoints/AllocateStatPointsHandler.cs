using Kombats.Players.Application.Abstractions;
using Kombats.Players.Application.IntegrationEvents;
using Kombats.Players.Domain.Exceptions;
using Kombats.Shared.Types;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Players.Application.UseCases.AllocateStatPoints;

internal sealed class AllocateStatPointsHandler
    : ICommandHandler<AllocateStatPointsCommand, AllocateStatPointsResult>
{
    private readonly IUnitOfWork _uow;
    private readonly ICharacterRepository _characters;
    private readonly IPublishEndpoint _publishEndpoint;

    public AllocateStatPointsHandler(
        IUnitOfWork uow,
        ICharacterRepository characters,
        IPublishEndpoint publishEndpoint)
    {
        _uow = uow;
        _characters = characters;
        _publishEndpoint = publishEndpoint;
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

        // Fast fail: client is stale (nice UX). Still keep DB concurrency catch below.
        if (character.Revision != cmd.ExpectedRevision)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Conflict(
                    "AllocateStatPoints.RevisionMismatch",
                    $"Stale character state. Expected {cmd.ExpectedRevision}, but current is {character.Revision}. Reload and retry."));
        }

        try
        {
            character.AllocatePoints(cmd.Str, cmd.Agi, cmd.Intuition, cmd.Vit);
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

                _ => Result.Failure<AllocateStatPointsResult>(
                    Error.Problem("AllocateStatPoints.DomainError", ex.Message))
            };
        }

        try
        {
            await _uow.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Conflict(
                    "AllocateStatPoints.ConcurrentUpdate",
                    "Character was modified by another request. Reload and retry."));
        }

        // MVP: direct publish after SaveChanges. Event may be lost if publish fails.
        await _publishEndpoint.Publish(
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
