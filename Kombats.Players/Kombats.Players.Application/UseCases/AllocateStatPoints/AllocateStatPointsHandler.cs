using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain.Entities;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.AllocateStatPoints;

public sealed class AllocateStatPointsHandler : ICommandHandler<AllocateStatPointsCommand, AllocateStatPointsResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IPlayerRepository _players;

    public AllocateStatPointsHandler(
        IUnitOfWork uow,
        IPlayerRepository players)
    {
        _uow = uow;
        _players = players;
    }

    public async Task<Result<AllocateStatPointsResult>> HandleAsync(AllocateStatPointsCommand cmd, CancellationToken ct)
    {
        var player = await _players.GetByIdAsync(cmd.PlayerId, ct);
        if (player is null)
        {
                return Result.Failure<AllocateStatPointsResult>(
                    Error.NotFound("AllocateStatPoints.PlayerNotFound", $"Player with id {cmd.PlayerId} was not found."));
        }

        try
        {
            player.Character.AllocatePoints(cmd.Str, cmd.Agi, cmd.Intuition, cmd.Vit);
        }
        catch (InvalidOperationException ex)
        {
            return ex.Message switch
            {
                "NegativePoints" => Result.Failure<AllocateStatPointsResult>(
                    Error.Validation("AllocateStatPoints.NegativePoints", "Stat point values cannot be negative.")),
                "NotEnoughPoints" => Result.Failure<AllocateStatPointsResult>(
                    Error.Conflict("AllocateStatPoints.NotEnoughPoints", "Insufficient unspent points to allocate.")),
                _ => Result.Failure<AllocateStatPointsResult>(
                    Error.Problem("AllocateStatPoints.InvalidOperation", ex.Message))
            };
        }

        await _uow.SaveChangesAsync(ct);

        return Result.Success(new AllocateStatPointsResult(
            Strength: player.Character.Strength,
            Agility: player.Character.Agility,
            Intuition: player.Character.Intuition,
            Vitality: player.Character.Vitality,
            UnspentPoints: player.Character.UnspentPoints,
            Revision: player.Character.Revision));
    }
}

