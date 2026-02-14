using System.Text.Json;
using Kombats.Shared.Events;
using MassTransit;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Kombats.Auth.Infrastructure.Outbox;

public sealed class OutboxDispatcherHostedService : BackgroundService
{
    private const int BatchSize = 10;
    private const int PollIntervalSeconds = 5;

    // Max attempts (attempt_count lives in retry_count column)
    private const int MaxRetries = 5;

    // If a message is stuck in Processing (e.g., process crash), it will be requeued.
    private const int ProcessingTimeoutMinutes = 10;

    // Publish must not hang indefinitely when broker is unreachable.
    private static readonly TimeSpan PublishTimeout = TimeSpan.FromSeconds(10);

    private readonly ILogger<OutboxDispatcherHostedService> _logger;
    private readonly IServiceProvider _serviceProvider;

    public OutboxDispatcherHostedService(IServiceProvider serviceProvider, ILogger<OutboxDispatcherHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessOutboxMessagesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing outbox messages");
            }

            await Task.Delay(TimeSpan.FromSeconds(PollIntervalSeconds), stoppingToken);
        }
    }

    private async Task ProcessOutboxMessagesAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var outboxRepository = scope.ServiceProvider.GetRequiredService<IOutboxRepository>();
        var publishEndpoint = scope.ServiceProvider.GetRequiredService<IPublishEndpoint>();

        // Requeue stuck processing messages
        await outboxRepository.RequeueStuckProcessingAsync(ProcessingTimeoutMinutes, cancellationToken);

        // Atomically claim due pending messages (claim increments RetryCount as attempt counter)
        var messages = await outboxRepository.GetUnprocessedAsync(BatchSize, cancellationToken);
        if (messages.Count == 0) return;

        _logger.LogInformation("Processing {Count} outbox messages", messages.Count);

        foreach (var message in messages)
        {
            try
            {
                _logger.LogDebug(
                    "Publishing outbox message {MessageId} of type {Type} (Attempt: {Attempt}/{MaxAttempts})",
                    message.Id,
                    message.Type,
                    message.RetryCount,
                    MaxRetries);

                using var publishCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                publishCts.CancelAfter(PublishTimeout);

                await PublishMessageAsync(message, publishEndpoint, publishCts.Token);
                await outboxRepository.MarkAsProcessedAsync(message.Id, cancellationToken);

                _logger.LogInformation(
                    "Successfully processed outbox message {MessageId} of type {Type} (Attempt: {Attempt}/{MaxAttempts}, Status: Processing -> Processed)",
                    message.Id,
                    message.Type,
                    message.RetryCount,
                    MaxRetries);
            }
            catch (OperationCanceledException oce) when (!cancellationToken.IsCancellationRequested)
            {
                // Publish timeout -> treat as transient broker issue.
                _logger.LogWarning(
                    oce,
                    "Publish timed out for outbox message {MessageId} of type {Type} (Attempt: {Attempt}/{MaxAttempts}). Will retry.",
                    message.Id,
                    message.Type,
                    message.RetryCount,
                    MaxRetries);

                await outboxRepository.MarkAsFailedOrRetryAsync(
                    message.Id,
                    oce.ToString(),
                    MaxRetries,
                    cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to process outbox message {MessageId} of type {Type} (Attempt: {Attempt}/{MaxAttempts}), will retry or mark as failed",
                    message.Id,
                    message.Type,
                    message.RetryCount,
                    MaxRetries);

                await outboxRepository.MarkAsFailedOrRetryAsync(
                    message.Id,
                    ex.ToString(),
                    MaxRetries,
                    cancellationToken);
            }
        }
    }

    private static async Task PublishMessageAsync(
        OutboxMessage message,
        IPublishEndpoint publishEndpoint,
        CancellationToken cancellationToken)
    {
        switch (message.Type)
        {
            case EventType.IdentityRegistered:
                var @event = JsonSerializer.Deserialize<IdentityRegisteredEvent>(message.Payload);
                if (@event != null)
                {
                    await publishEndpoint.Publish(@event, cancellationToken);
                }
                break;

            default:
                throw new InvalidOperationException($"Unknown message type: {message.Type}");
        }
    }
}
