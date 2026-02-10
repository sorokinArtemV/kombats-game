namespace Kombats.BuildingBlocks.Messaging.Outbox;

public interface IOutboxRepository
{
    Task StoreAsync(OutboxMessage message, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OutboxMessage>>
        GetUnprocessedAsync(int batchSize, CancellationToken cancellationToken = default);

    Task MarkAsProcessedAsync(Guid messageId, CancellationToken cancellationToken = default);

    Task MarkAsFailedOrRetryAsync(
        Guid messageId,
        string error,
        int maxRetries,
        CancellationToken cancellationToken = default);

    Task RequeueStuckProcessingAsync(int timeoutMinutes, CancellationToken cancellationToken = default);
}