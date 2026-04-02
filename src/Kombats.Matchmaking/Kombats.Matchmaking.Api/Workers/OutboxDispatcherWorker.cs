using Kombats.Battle.Contracts.Battle;
using Kombats.Matchmaking.Infrastructure.Data;
using Kombats.Matchmaking.Infrastructure.Options;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Text.Json;
using Kombats.Matchmaking.Infrastructure.Entities;

namespace Kombats.Matchmaking.Api.Workers;

/// <summary>
/// Background service that periodically dispatches pending outbox messages to RabbitMQ.
/// Implements transactional outbox pattern: reads pending messages, publishes to RabbitMQ, marks as Published.
/// </summary>
public sealed class OutboxDispatcherWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxDispatcherWorker> _logger;
    private readonly OutboxDispatcherOptions _options;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public OutboxDispatcherWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<OutboxDispatcherWorker> logger,
        IOptions<OutboxDispatcherOptions> options)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "OutboxDispatcherWorker started. DispatchInterval: {DispatchIntervalMs}ms, BatchSize: {BatchSize}, MaxRetryCount: {MaxRetryCount}",
            _options.DispatchIntervalMs, _options.BatchSize, _options.MaxRetryCount);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                await DispatchPendingMessagesAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OutboxDispatcherWorker dispatch cycle");
            }

            await Task.Delay(TimeSpan.FromMilliseconds(_options.DispatchIntervalMs), stoppingToken);
        }

        _logger.LogInformation("OutboxDispatcherWorker stopped");
    }

    private async Task DispatchPendingMessagesAsync(IServiceProvider serviceProvider, CancellationToken cancellationToken)
    {
        var dbContext = serviceProvider.GetRequiredService<MatchmakingDbContext>();
        var sendEndpointProvider = serviceProvider.GetRequiredService<ISendEndpointProvider>();

        // Query pending messages (ordered by OccurredAtUtc for FIFO processing)
        var pendingMessages = await dbContext.OutboxMessages
            .Where(m => m.Status == OutboxMessageStatus.Pending)
            .OrderBy(m => m.OccurredAtUtc)
            .Take(_options.BatchSize)
            .ToListAsync(cancellationToken);

        if (pendingMessages.Count == 0)
        {
            return; // No pending messages
        }

        _logger.LogDebug(
            "Processing {Count} pending outbox messages",
            pendingMessages.Count);

        foreach (var message in pendingMessages)
        {
            try
            {
                await DispatchMessageAsync(dbContext, sendEndpointProvider, message, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to dispatch outbox message: Id={MessageId}, Type={MessageType}, RetryCount={RetryCount}",
                    message.Id, message.Type, message.RetryCount);

                // Update retry count and error info
                message.RetryCount++;
                message.LastError = ex.Message;
                message.LastAttemptAtUtc = DateTime.UtcNow;

                // Mark as Failed if exceeded max retries
                if (message.RetryCount > _options.MaxRetryCount)
                {
                    message.Status = OutboxMessageStatus.Failed;
                    _logger.LogWarning(
                        "Outbox message exceeded max retries, marked as Failed: Id={MessageId}, Type={MessageType}, RetryCount={RetryCount}",
                        message.Id, message.Type, message.RetryCount);
                }
                else
                {
                    // Keep as Pending for retry (exponential backoff handled by dispatch interval)
                    _logger.LogInformation(
                        "Outbox message will be retried: Id={MessageId}, Type={MessageType}, RetryCount={RetryCount}/{MaxRetryCount}",
                        message.Id, message.Type, message.RetryCount, _options.MaxRetryCount);
                }

                await dbContext.SaveChangesAsync(cancellationToken);
            }
        }
    }

    private async Task DispatchMessageAsync(
        MatchmakingDbContext dbContext,
        ISendEndpointProvider sendEndpointProvider,
        OutboxMessageEntity message,
        CancellationToken cancellationToken)
    {
        // Determine endpoint based on message type
        Uri endpointUri;
        if (message.Type.Contains("CreateBattle", StringComparison.OrdinalIgnoreCase))
        {
            endpointUri = new Uri(_options.CreateBattleQueueName);
        }
        else
        {
            throw new InvalidOperationException($"Unknown message type: {message.Type}");
        }

        var endpoint = await sendEndpointProvider.GetSendEndpoint(endpointUri);

        if (message.Type.Contains("CreateBattle", StringComparison.OrdinalIgnoreCase))
        {
            // Deserialize to the typed CreateBattle contract so MassTransit sends
            // the correct message type envelope for the Battle consumer
            var command = JsonSerializer.Deserialize<CreateBattle>(message.Payload, JsonOptions);
            if (command == null)
                throw new InvalidOperationException($"Failed to deserialize CreateBattle payload for message {message.Id}");

            await endpoint.Send(command, cancellationToken);
        }
        else
        {
            throw new InvalidOperationException($"Unsupported message type for dispatch: {message.Type}");
        }

        // Mark as Published
        message.Status = OutboxMessageStatus.Published;
        message.LastAttemptAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogDebug(
            "Dispatched outbox message: Id={MessageId}, Type={MessageType}, Endpoint={Endpoint}",
            message.Id, message.Type, endpointUri);
    }
}

