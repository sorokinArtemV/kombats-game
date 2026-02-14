using Dapper;
using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Domain.Entities;
using Kombats.Auth.Infrastructure.Outbox;

namespace Kombats.Auth.Infrastructure.Data;

public sealed class TransactionalUnitOfWork : ITransactionalUnitOfWork
{
    private readonly IDbConnectionFactory _connectionFactory;

    public TransactionalUnitOfWork(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task CreateIdentityWithOutboxAsync(
        Identity identity,
        OutboxEnvelope outbox,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            const string IdentityQuery = """
                                         INSERT INTO auth."identities" ("id", "email", "password_hash", "status", "version")
                                         VALUES (@Id, @Email, @PasswordHash, @Status, @Version);
                                         """;

            var identityEntity = new
            {
                identity.Id,
                Email = identity.Email.Value,
                identity.PasswordHash,
                identity.Status,
                identity.Version
            };

            await connection.ExecuteAsync(IdentityQuery, identityEntity, transaction);

            const string OutboxQuery = """
                                       INSERT INTO auth.outbox_messages
                                           (id, occurred_at, type, payload, status_text, retry_count, updated_at)
                                       VALUES
                                           (@Id, @OccurredAt, @Type, @Payload::jsonb, @StatusText, 0, now());
                                       """;

            var outboxEntity = new
            {
                outbox.Id,
                outbox.OccurredAt,
                outbox.Type,
                outbox.Payload,
                StatusText = OutboxStatus.Pending.ToDbString()
            };

            await connection.ExecuteAsync(OutboxQuery, outboxEntity, transaction);

            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }
}
