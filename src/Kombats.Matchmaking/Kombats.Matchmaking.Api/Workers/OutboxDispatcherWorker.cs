using Kombats.Matchmaking.Infrastructure.Messaging;
using Kombats.Matchmaking.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace Kombats.Matchmaking.Api.Workers;

/// <summary>
/// Background service that periodically dispatches pending outbox messages to RabbitMQ.
/// Thin scheduling shell — delegates all dispatch logic to OutboxDispatcherService.
/// </summary>
public sealed class OutboxDispatcherWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxDispatcherWorker> _logger;
    private readonly OutboxDispatcherOptions _options;

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
                var dispatcher = scope.ServiceProvider.GetRequiredService<OutboxDispatcherService>();
                await dispatcher.DispatchPendingMessagesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OutboxDispatcherWorker dispatch cycle");
            }

            await Task.Delay(TimeSpan.FromMilliseconds(_options.DispatchIntervalMs), stoppingToken);
        }

        _logger.LogInformation("OutboxDispatcherWorker stopped");
    }
}
