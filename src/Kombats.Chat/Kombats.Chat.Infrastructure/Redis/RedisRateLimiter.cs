using System.Collections.Concurrent;
using Kombats.Chat.Application.Ports;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Kombats.Chat.Infrastructure.Redis;

internal sealed class RedisRateLimiter(IConnectionMultiplexer redis, ILogger<RedisRateLimiter> logger) : IRateLimiter
{
    // Rate limit configuration per surface
    private static readonly Dictionary<string, (int MaxCount, int WindowSeconds)> SurfaceLimits = new()
    {
        ["global"] = (5, 10),
        ["dm"] = (10, 30),
        ["presence"] = (1, 5),
    };

    // In-memory fallback state
    private readonly ConcurrentDictionary<string, (int Count, DateTimeOffset WindowStart)> _fallbackState = new();
    private volatile bool _usingFallback;

    public async Task<RateLimitResult> CheckAndIncrementAsync(Guid identityId, string surface, CancellationToken ct)
    {
        if (!SurfaceLimits.TryGetValue(surface, out var limits))
            return new RateLimitResult(true);

        try
        {
            var result = await CheckRedisAsync(identityId, surface, limits.MaxCount, limits.WindowSeconds);

            if (_usingFallback)
            {
                _usingFallback = false;
                logger.LogInformation("Rate limiter recovered — switched back to Redis");
            }

            return result;
        }
        catch (RedisException ex)
        {
            if (!_usingFallback)
            {
                _usingFallback = true;
                logger.LogWarning(ex, "Rate limiter falling back to in-memory — Redis unavailable");
            }

            return CheckFallback(identityId, surface, limits.MaxCount, limits.WindowSeconds);
        }
    }

    private async Task<RateLimitResult> CheckRedisAsync(Guid identityId, string surface, int maxCount, int windowSeconds)
    {
        var db = redis.GetDatabase(2);
        string key = $"chat:ratelimit:{identityId}:{surface}";

        long count = await db.StringIncrementAsync(key);

        if (count == 1)
        {
            // First request in window — set expiry
            await db.KeyExpireAsync(key, TimeSpan.FromSeconds(windowSeconds));
        }

        if (count > maxCount)
        {
            TimeSpan? ttl = await db.KeyTimeToLiveAsync(key);
            long retryAfterMs = ttl.HasValue ? (long)ttl.Value.TotalMilliseconds : windowSeconds * 1000L;
            return new RateLimitResult(false, retryAfterMs);
        }

        return new RateLimitResult(true);
    }

    private RateLimitResult CheckFallback(Guid identityId, string surface, int maxCount, int windowSeconds)
    {
        string key = $"{identityId}:{surface}";
        var now = DateTimeOffset.UtcNow;

        var state = _fallbackState.AddOrUpdate(key,
            _ => (1, now),
            (_, existing) =>
            {
                if (now - existing.WindowStart > TimeSpan.FromSeconds(windowSeconds))
                    return (1, now);
                return (existing.Count + 1, existing.WindowStart);
            });

        if (state.Count > maxCount)
        {
            var windowEnd = state.WindowStart.AddSeconds(windowSeconds);
            long retryAfterMs = Math.Max(0, (long)(windowEnd - now).TotalMilliseconds);
            return new RateLimitResult(false, retryAfterMs);
        }

        return new RateLimitResult(true);
    }
}
