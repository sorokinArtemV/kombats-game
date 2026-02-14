using Kombats.Auth.Domain.Entities;


namespace Kombats.Auth.Application.Abstractions;

public interface ITransactionalUnitOfWork
{
    Task CreateIdentityWithOutboxAsync(
        Identity identity,
        OutboxEnvelope outbox,
        CancellationToken cancellationToken = default);
}