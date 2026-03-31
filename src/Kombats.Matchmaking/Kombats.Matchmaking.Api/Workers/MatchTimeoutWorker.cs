using Kombats.Matchmaking.Application.Abstractions;
using Kombats.Matchmaking.Domain;
using Kombats.Matchmaking.Infrastructure.Data;
using Kombats.Matchmaking.Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Kombats.Matchmaking.Api.Workers;

/// <summary>
/// Background service that scans for matches stuck in BattleCreateRequested state and marks them as TimedOut.
/// </summary>
public sealed class MatchTimeoutWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MatchTimeoutWorker> _logger;
    private readonly MatchTimeoutWorkerOptions _options;

    public MatchTimeoutWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<MatchTimeoutWorker> logger,
        IOptions<MatchTimeoutWorkerOptions> options)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "MatchTimeoutWorker started. ScanInterval: {ScanIntervalMs}ms, TimeoutThreshold: {TimeoutSeconds}s",
            _options.ScanIntervalMs, _options.TimeoutSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                await ScanAndMarkTimedOutMatchesAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in MatchTimeoutWorker scan");
            }

            await Task.Delay(TimeSpan.FromMilliseconds(_options.ScanIntervalMs), stoppingToken);
        }

        _logger.LogInformation("MatchTimeoutWorker stopped");
    }

    private async Task ScanAndMarkTimedOutMatchesAsync(IServiceProvider serviceProvider, CancellationToken cancellationToken)
    {
        var matchRepository = serviceProvider.GetRequiredService<IMatchRepository>();

        DateTimeOffset timeoutThreshold = DateTimeOffset.UtcNow.AddSeconds(-_options.TimeoutSeconds);
        var updatedAt = DateTime.UtcNow;

        // Use conditional update: only timeout matches that are still in BattleCreateRequested state
        // and older than the threshold. This ensures race-free updates - matches that have already
        // progressed to BattleCreated or other states will not be affected.
        var affectedRows = await matchRepository.TimeoutMatchesConditionallyAsync(
            timeoutThreshold,
            updatedAt,
            cancellationToken);

        if (affectedRows > 0)
        {
            _logger.LogWarning(
                "Conditionally timed out {Count} matches that were still in BattleCreateRequested state and older than {TimeoutSeconds}s",
                affectedRows, _options.TimeoutSeconds);
        }
    }
}


