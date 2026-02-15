using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain;
using Kombats.Players.Domain.Exceptions;
using Kombats.Shared.Types;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Players.Application.UseCases.AllocateStatPoints;

public sealed class AllocateStatPointsHandler
    : ICommandHandler<AllocateStatPointsCommand, AllocateStatPointsResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IPlayerRepository _players;

    public AllocateStatPointsHandler(IUnitOfWork uow, IPlayerRepository players)
    {
        _uow = uow;
        _players = players;
    }

    public async Task<Result<AllocateStatPointsResult>> HandleAsync(AllocateStatPointsCommand cmd, CancellationToken ct)
    {
        if (cmd.ExpectedRevision <= 0)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Validation("AllocateStatPoints.ExpectedRevisionInvalid", "ExpectedRevision must be a positive integer."));
        }

        var player = await _players.GetByIdAsync(cmd.PlayerId, ct);
        if (player is null)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.NotFound("AllocateStatPoints.PlayerNotFound", $"Player with id {cmd.PlayerId} was not found."));
        }

        var playerCharacter = player.Character;
        
        if (playerCharacter is null)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.NotFound("AllocateStatPoints.CharacterNotFound", "Character not found for player."));
        }

        // Fast fail: client is stale (nice UX). Still keep DB concurrency catch below.
        if (playerCharacter.Revision != cmd.ExpectedRevision)
        {
            return Result.Failure<AllocateStatPointsResult>(
                Error.Conflict(
                    "AllocateStatPoints.RevisionMismatch",
                    $"Stale character state. Expected {cmd.ExpectedRevision}, but current is {playerCharacter.Revision}. Reload and retry."));
        }

        try
        {
            playerCharacter.AllocatePoints(cmd.Str, cmd.Agi, cmd.Intuition, cmd.Vit);
        }
        catch (DomainException ex)
        {
            return ex.Code switch
            {
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

        return Result.Success(new AllocateStatPointsResult(
            Strength: playerCharacter.Strength,
            Agility: playerCharacter.Agility,
            Intuition: playerCharacter.Intuition,
            Vitality: playerCharacter.Vitality,
            UnspentPoints: playerCharacter.UnspentPoints,
            Revision: playerCharacter.Revision));
    }
}
