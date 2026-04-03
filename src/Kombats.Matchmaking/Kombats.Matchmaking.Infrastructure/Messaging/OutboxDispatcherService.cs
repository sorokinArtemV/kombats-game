using Kombats.Battle.Contracts.Battle;
using Kombats.Matchmaking.Infrastructure.Data;
using Kombats.Matchmaking.Infrastructure.Entities;
using Kombats.Matchmaking.Infrastructure.Options;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace Kombats.Matchmaking.Infrastructure.Messaging;

/// <summary>
/// Infrastructure service that dispatches pending outbox messages to RabbitMQ.
/// Owns: EF querying, payload deserialization, endpoint resolution, send, retry/failure handling.
/// </summary>
public sealed class OutboxDispatcherService
{
    private readonly MatchmakingDbContext _dbContext;
    private readonly ISendEndpointProvider _sendEndpointProvider;
    private readonly ILogger<OutboxDispatcherService> _logger;
    private readonly OutboxDispatcherOptions _options;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public OutboxDispatcherService(
        MatchmakingDbContext dbContext,
        ISendEndpointProvider sendEndpointProvider,
        ILogger<OutboxDispatcherService> logger,
        IOptions<OutboxDispatcherOptions> options)
    {
        _dbContext = dbContext;
        _sendEndpointProvider = sendEndpointProvider;
        _logger = logger;
        _options = options.Value;
    }

    /// <summary>
    /// Queries pending outbox messages and dispatches them.
    /// Handles retry/failure semantics per message.
    /// </summary>
    public async Task DispatchPendingMessagesAsync(CancellationToken cancellationToken)
    {
        // Query pending messages (ordered by OccurredAtUtc for FIFO processing)
        var pendingMessages = await _dbContext.OutboxMessages
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
                await DispatchMessageAsync(message, cancellationToken);
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

                await _dbContext.SaveChangesAsync(cancellationToken);
            }
        }
    }

    private async Task DispatchMessageAsync(
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

        var endpoint = await _sendEndpointProvider.GetSendEndpoint(endpointUri);

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
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogDebug(
            "Dispatched outbox message: Id={MessageId}, Type={MessageType}, Endpoint={Endpoint}",
            message.Id, message.Type, endpointUri);
    }
}
