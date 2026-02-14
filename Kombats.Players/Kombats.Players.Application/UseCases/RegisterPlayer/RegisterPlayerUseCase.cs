using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain.Entities;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.RegisterPlayer;

public sealed class RegisterPlayerHandler : ICommandHandler<RegisterPlayerCommand, RegisterPlayerResult>
{
    private readonly IUnitOfWork _uow;
    private readonly IInboxRepository _inbox;
    private readonly IPlayerRepository _players;

    public RegisterPlayerHandler(
        IUnitOfWork uow,
        IInboxRepository inbox,
        IPlayerRepository players)
    {
        _uow = uow;
        _inbox = inbox;
        _players = players;
    }

    public async Task<Result<RegisterPlayerResult>> HandleAsync(RegisterPlayerCommand cmd, CancellationToken ct)
    {
        if (await _inbox.IsProcessedAsync(cmd.MessageId, ct))
            return Result.Success(new RegisterPlayerResult(cmd.IdentityId, Created: false));

        var existing = await _players.GetByIdAsync(cmd.IdentityId, ct);
        if (existing is not null)
        {
            await _inbox.AddProcessedAsync(cmd.MessageId, cmd.OccuredAt, ct);
            await _uow.SaveChangesAsync(ct);
            return Result.Success(new RegisterPlayerResult(existing.Id, Created: false));
        }
        
        var player = Player.CreateNew(cmd.IdentityId, cmd.OccuredAt); 
        _players.Add(player);

        await _inbox.AddProcessedAsync(cmd.MessageId, cmd.OccuredAt, ct);
        await _uow.SaveChangesAsync(ct);

        return Result.Success(new RegisterPlayerResult(player.Id, Created: true));
    }
}
