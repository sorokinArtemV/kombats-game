using Dapper;
using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Infrastructure.Data;
using Kombats.Auth.Infrastructure.Outbox;

namespace Kombats.Auth.Infrastructure.Repositories;

/// <summary>
/// Postgres/Dapper outbox repository.
///
/// Semantics:
/// - retry_count is treated as an ATTEMPT counter (increments on claim when a worker takes a message).
/// - retries are scheduled via next_attempt_at (exponential backoff).
/// </summary>
public sealed class OutboxRepository : IOutboxRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    // Backoff: 5s, 10s, 20s, 40s ... capped at 300s.
    // Keep these values aligned with the hosted service timeouts.
    private const int BaseRetryDelaySeconds = 5;
    private const int MaxRetryDelaySeconds = 300;

    public OutboxRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task StoreAsync(OutboxMessage message, CancellationToken cancellationToken = default)
    {
        const string Query = """
                             INSERT INTO auth.outbox_messages (id, occurred_at, type, payload, status_text, retry_count, next_attempt_at, updated_at)
                             VALUES (@Id, @OccurredAt, @Type, @Payload::jsonb, @StatusText, 0, NULL, now());
                             """;

        var entity = new
        {
            message.Id,
            message.OccurredAt,
            message.Type,
            message.Payload,
            StatusText = OutboxStatus.Pending.ToDbString()
        };

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(Query, entity);
    }

    public async Task<IReadOnlyList<OutboxMessage>> GetUnprocessedAsync(int batchSize, CancellationToken cancellationToken = default)
    {
        // Claim due messages atomically:
        // - Pending only
        // - next_attempt_at is NULL or due
        // - FOR UPDATE SKIP LOCKED to enable multiple workers
        // - increment retry_count on claim (attempt counter)
        const string Query = """
                             WITH cte AS (
                                 SELECT id
                                 FROM auth.outbox_messages
                                 WHERE status_text = @Pending
                                   AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                                 ORDER BY occurred_at ASC
                                 LIMIT @BatchSize
                                 FOR UPDATE SKIP LOCKED
                             )
                             UPDATE auth.outbox_messages o
                             SET status_text = @Processing,
                                 locked_at = now(),
                                 next_attempt_at = NULL,
                                 retry_count = o.retry_count + 1,
                                 updated_at = now()
                             FROM cte
                             WHERE o.id = cte.id
                             RETURNING o.id, o.occurred_at, o.type, o.payload, o.retry_count;
                             """;

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var results = await connection.QueryAsync<OutboxMessageEntity>(
                Query,
                new
                {
                    BatchSize = batchSize,
                    Pending = OutboxStatus.Pending.ToDbString(),
                    Processing = OutboxStatus.Processing.ToDbString()
                },
                transaction);

            await transaction.CommitAsync(cancellationToken);

            return results.Select(ToDomain).ToList();
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task MarkAsProcessedAsync(Guid messageId, CancellationToken cancellationToken = default)
    {
        const string Query = """
                             UPDATE auth.outbox_messages
                             SET processed_at = now(),
                                 status_text = @Processed,
                                 locked_at = NULL,
                                 next_attempt_at = NULL,
                                 last_error = NULL,
                                 updated_at = now()
                             WHERE id = @Id AND status_text = @Processing;
                             """;

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(
            Query,
            new
            {
                Id = messageId,
                Processed = OutboxStatus.Processed.ToDbString(),
                Processing = OutboxStatus.Processing.ToDbString()
            });
    }

    public async Task MarkAsFailedOrRetryAsync(
        Guid messageId,
        string error,
        int maxRetries,
        CancellationToken cancellationToken = default)
    {
        // Truncate error to 4000 characters
        var truncatedError = error.Length > 4000 ? error[..4000] : error;

        // NOTE:
        // retry_count is an attempt counter and is already incremented during claim.
        // Here we only schedule the next attempt (or mark as Failed).
        const string Query = """
                             UPDATE auth.outbox_messages
                             SET last_error = @Error,
                                 status_text = CASE
                                     WHEN retry_count >= @MaxRetries THEN @Failed
                                     ELSE @Pending
                                 END,
                                 next_attempt_at = CASE
                                     WHEN retry_count >= @MaxRetries THEN NULL
                                     ELSE now() + make_interval(secs => LEAST(@MaxDelaySeconds,
                                         (@BaseDelaySeconds * power(2, GREATEST(retry_count - 1, 0)))::int
                                     ))
                                 END,
                                 locked_at = NULL,
                                 processed_at = NULL,
                                 updated_at = now()
                             WHERE id = @Id AND status_text = @Processing;
                             """;

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(
            Query,
            new
            {
                Id = messageId,
                Error = truncatedError,
                MaxRetries = maxRetries,
                Failed = OutboxStatus.Failed.ToDbString(),
                Pending = OutboxStatus.Pending.ToDbString(),
                Processing = OutboxStatus.Processing.ToDbString(),
                BaseDelaySeconds = BaseRetryDelaySeconds,
                MaxDelaySeconds = MaxRetryDelaySeconds
            });
    }

    public async Task RequeueStuckProcessingAsync(int timeoutMinutes, CancellationToken cancellationToken = default)
    {
        const string Query = """
                             UPDATE auth.outbox_messages
                             SET status_text = @Pending,
                                 locked_at = NULL,
                                 next_attempt_at = now(),
                                 updated_at = now()
                             WHERE status_text = @Processing
                               AND locked_at < now() - make_interval(mins => @TimeoutMinutes);
                             """;

        await using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await connection.ExecuteAsync(
            Query,
            new
            {
                TimeoutMinutes = timeoutMinutes,
                Pending = OutboxStatus.Pending.ToDbString(),
                Processing = OutboxStatus.Processing.ToDbString()
            });
    }

    private static OutboxMessage ToDomain(OutboxMessageEntity entity)
    {
        return new OutboxMessage(
            entity.Id,
            entity.OccurredAt,
            entity.Type,
            entity.Payload,
            entity.RetryCount);
    }

    private sealed class OutboxMessageEntity
    {
        public Guid Id { get; set; }
        public DateTimeOffset OccurredAt { get; set; }
        public string Type { get; set; } = null!;
        public string Payload { get; set; } = null!;
        public int RetryCount { get; set; }
    }
}
