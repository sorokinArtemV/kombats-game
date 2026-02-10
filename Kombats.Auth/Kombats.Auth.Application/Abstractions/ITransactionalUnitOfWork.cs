using Kombats.Auth.Domain.Entities;
using Kombats.BuildingBlocks.Messaging.Outbox;

namespace Kombats.Auth.Application.Abstractions;

public interface ITransactionalUnitOfWork
{
    public Task CreateIdentityWithOutboxAsync(
        Identity identity,
        OutboxMessage outboxMessage,
        CancellationToken cancellationToken = default);
}