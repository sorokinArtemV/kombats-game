using Kombats.Matchmaking.Application.UseCases;
using Kombats.Matchmaking.Infrastructure;
using Kombats.Matchmaking.Infrastructure.Options;
using Kombats.Matchmaking.Infrastructure.Redis;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace Kombats.Matchmaking.Api.Workers;

/// <summary>
/// Background service that performs matchmaking ticks at configured intervals.
/// Uses Redis lease lock for multi-instance safety with lease renewal (heartbeat).
/// </summary>
public sealed class MatchmakingWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<MatchmakingWorker> _logger;
    private readonly ILogger<RedisLeaseLock> _leaseLockLogger;
    private readonly MatchmakingWorkerOptions _options;
    private readonly InstanceIdService _instanceIdService;

    public MatchmakingWorker(
        IServiceScopeFactory scopeFactory,
        IConnectionMultiplexer redis,
        ILogger<MatchmakingWorker> logger,
        ILogger<RedisLeaseLock> leaseLockLogger,
        IOptions<MatchmakingWorkerOptions> options,
        InstanceIdService instanceIdService)
    {
        _scopeFactory = scopeFactory;
        _redis = redis;
        _logger = logger;
        _leaseLockLogger = leaseLockLogger;
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
        var lockKey = RedisLeaseLock.GetLockKey(variant);
        const int lockTtlMs = 5000; // Lock expires after 5 seconds (must be renewed)
        var renewalIntervalMs = lockTtlMs / 3; // Renew every 1/3 of TTL

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var leaseLock = new RedisLeaseLock(_redis, _leaseLockLogger, 1);

                // Try to acquire lease lock for this variant
                var lockAcquired = await leaseLock.TryAcquireLockAsync(
                    lockKey,
                    lockTtlMs,
                    instanceId,
                    stoppingToken);

                if (!lockAcquired)
                {
                    // Another instance has the lock - sleep and retry
                    _logger.LogDebug(
                        "Lease lock not acquired for variant {Variant}, sleeping. InstanceId={InstanceId}",
                        variant, instanceId);
                    await Task.Delay(TimeSpan.FromMilliseconds(_options.TickDelayMs), stoppingToken);
                    continue;
                }

                // We have the lock - start renewal loop and perform matchmaking tick
                // Create a cancellation source that can be cancelled by renewal loop or stoppingToken
                using var leaseLostSource = new CancellationTokenSource();
                using var tickCancellationSource = CancellationTokenSource.CreateLinkedTokenSource(
                    stoppingToken,
                    leaseLostSource.Token);

                var renewalTask = StartRenewalLoopAsync(
                    leaseLock,
                    lockKey,
                    instanceId,
                    lockTtlMs,
                    renewalIntervalMs,
                    leaseLostSource,
                    stoppingToken);

                try
                {
                    // Perform matchmaking tick with cancellation support
                    var matchmakingService = scope.ServiceProvider.GetRequiredService<MatchmakingService>();
                    var result = await matchmakingService.MatchmakingTickAsync(variant, tickCancellationSource.Token);

                    if (result.Type == MatchCreatedResultType.MatchCreated && result.MatchInfo != null)
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
                catch (OperationCanceledException) when (leaseLostSource.Token.IsCancellationRequested && !stoppingToken.IsCancellationRequested)
                {
                    // Lease was lost - abort tick
                    _logger.LogWarning(
                        "Matchmaking tick aborted due to lost lease. InstanceId={InstanceId}, Variant={Variant}",
                        instanceId, variant);
                }
                finally
                {
                    // Stop renewal loop
                    leaseLostSource.Cancel();
                    try
                    {
                        await renewalTask;
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when cancellation is requested
                    }

                    // Release lock (optional - it will expire anyway, but good practice)
                    await leaseLock.ReleaseLockAsync(lockKey, instanceId, stoppingToken);
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

    /// <summary>
    /// Starts a background renewal loop that renews the lease every renewalIntervalMs.
    /// If renewal fails (returns 0), cancels the leaseLostSource to abort the tick.
    /// </summary>
    private async Task StartRenewalLoopAsync(
        RedisLeaseLock leaseLock,
        string lockKey,
        string instanceId,
        int ttlMs,
        int renewalIntervalMs,
        CancellationTokenSource leaseLostSource,
        CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested && !leaseLostSource.Token.IsCancellationRequested)
            {
                await Task.Delay(renewalIntervalMs, stoppingToken);

                if (stoppingToken.IsCancellationRequested || leaseLostSource.Token.IsCancellationRequested)
                    break;

                var renewalResult = await leaseLock.RenewLeaseAsync(
                    lockKey,
                    instanceId,
                    ttlMs,
                    stoppingToken);

                if (renewalResult == 0)
                {
                    // Lease lost - cancel the tick
                    _logger.LogWarning(
                        "Lease renewal failed (lease lost). Aborting tick. InstanceId={InstanceId}, LockKey={LockKey}",
                        instanceId, lockKey);
                    leaseLostSource.Cancel();
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected when cancellation is requested
        }
    }
}

