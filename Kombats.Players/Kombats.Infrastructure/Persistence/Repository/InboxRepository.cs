using Kombats.Infrastructure.Data;
using Kombats.Infrastructure.Messaging.Inbox;
using Kombats.Players.Application.Abstractions;
using Microsoft.EntityFrameworkCore;

namespace Kombats.Infrastructure.Repository;

public sealed class InboxRepository : IInboxRepository
{
    private readonly PlayersDbContext _db;

    public InboxRepository(PlayersDbContext db) => _db = db;

    public Task<bool> IsProcessedAsync(Guid messageId, CancellationToken ct)
        => _db.InboxMessages
            .AsNoTracking()
            .AnyAsync(x => x.MessageId == messageId, ct);

    public Task AddProcessedAsync(Guid messageId, DateTimeOffset processedAt, CancellationToken ct)
    {
        _db.InboxMessages.Add(new InboxMessage
        {
            MessageId = messageId,
            ProcessedAt = processedAt
        });

        return Task.CompletedTask;
    }
}