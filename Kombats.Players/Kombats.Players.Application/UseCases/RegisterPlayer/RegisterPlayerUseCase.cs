using Kombats.Players.Application.Abstractions;
using Kombats.Players.Domain.Entities;
using Kombats.Shared.Types;
using Microsoft.EntityFrameworkCore;
using Npgsql;

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
        // Always stage inbox insert at start for idempotency via PK constraint
        await _inbox.AddProcessedAsync(cmd.MessageId, DateTimeOffset.UtcNow, ct);

        var existing = await _players.GetByIdAsync(cmd.IdentityId, ct);
        if (existing is not null)
        {
            try
            {
                await _uow.SaveChangesAsync(ct);
                return Result.Success(new RegisterPlayerResult(existing.Id, Created: false));
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex))
            {
                // Message already processed by concurrent handler - idempotent success
                return Result.Success(new RegisterPlayerResult(existing.Id, Created: false));
            }
        }
        
        var player = Player.CreateNew(cmd.IdentityId, cmd.OccuredAt); 
        _players.Add(player);

        try
        {
            await _uow.SaveChangesAsync(ct);
            return Result.Success(new RegisterPlayerResult(player.Id, Created: true));
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // Message already processed by concurrent handler - idempotent success
            // Player may or may not exist, but message was processed
            return Result.Success(new RegisterPlayerResult(cmd.IdentityId, Created: false));
        }

        static bool IsUniqueViolation(DbUpdateException ex)
        {
            return ex.InnerException is PostgresException pgEx && pgEx.SqlState == "23505";
        }
    }
}
