using Kombats.Matchmaking.Application.UseCases;
using Kombats.Matchmaking.Infrastructure;
using Kombats.Matchmaking.Infrastructure.Options;
using Kombats.Matchmaking.Infrastructure.Redis;
using Microsoft.Extensions.Options;

namespace Kombats.Matchmaking.Api.Workers;

/// <summary>
/// Background service that performs matchmaking ticks at configured intervals.
/// Thin scheduling shell — delegates lease coordination and tick execution
/// to MatchmakingLeaseService.
/// </summary>
public sealed class MatchmakingWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly MatchmakingLeaseService _leaseService;
    private readonly ILogger<MatchmakingWorker> _logger;
    private readonly MatchmakingWorkerOptions _options;
    private readonly InstanceIdService _instanceIdService;

    public MatchmakingWorker(
        IServiceScopeFactory scopeFactory,
        MatchmakingLeaseService leaseService,
        ILogger<MatchmakingWorker> logger,
        IOptions<MatchmakingWorkerOptions> options,
        InstanceIdService instanceIdService)
    {
        _scopeFactory = scopeFactory;
        _leaseService = leaseService;
        _logger = logger;
        _options = options.Value;
        _instanceIdService = instanceIdService;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var instanceId = _instanceIdService.InstanceId;
        _logger.LogInformation(
            "MatchmakingWorker started. InstanceId={InstanceId}, TickDelay={TickDelayMs}ms",
            instanceId, _options.TickDelayMs);

        const string variant = "default";

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var matchmakingService = scope.ServiceProvider.GetRequiredService<MatchmakingService>();
                var result = await _leaseService.TryExecuteUnderLeaseAsync(
                    variant,
                    ct => matchmakingService.MatchmakingTickAsync(variant, ct),
                    stoppingToken);

                if (result is { Type: MatchCreatedResultType.MatchCreated, MatchInfo: not null })
                {
                    _logger.LogInformation(
                        "Match created: MatchId={MatchId}, BattleId={BattleId}, PlayerA={PlayerAId}, PlayerB={PlayerBId}, InstanceId={InstanceId}",
                        result.MatchInfo.MatchId,
                        result.MatchInfo.BattleId,
                        result.MatchInfo.PlayerAId,
                        result.MatchInfo.PlayerBId,
                        instanceId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Error in MatchmakingWorker tick. InstanceId={InstanceId}",
                    instanceId);
            }

            // Wait for configured delay before next tick
            await Task.Delay(TimeSpan.FromMilliseconds(_options.TickDelayMs), stoppingToken);
        }

        _logger.LogInformation(
            "MatchmakingWorker stopped. InstanceId={InstanceId}",
            instanceId);
    }
}
